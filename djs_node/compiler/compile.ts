import type { Brand } from "../utils.ts"
import type { Instruction } from "./bytecode.ts"
import type { Scope, ResolvedBinding } from "./scopes.ts"
import type {
  Class,
  Span,
  Stmt,
  Param,
  Expr,
  Func,
  Pattern,
  ObjectKey,
  PropExpr,
  IndexExpr,
  Ident,
} from "djs_ast"
import { QualifiedName, offset_to_line_and_col, preview_lines } from "djs_ast"
import { parse_source_file } from "djs_parser"
import {
  OP,
  INSTRUCTION_BYTES,
  encode_instructions,
  BUILTIN_PROTOTYPE,
} from "./bytecode.ts"
import { create_scope, declare_binding, resolve_binding } from "./scopes.ts"

export interface SourceNode {
  span?: Span
  kind?: string
}

export type SourceDiagnostic = { message: string; span?: Span }

// Decode source literals without running source on the host.
export function decode_string(text: string, node: SourceNode): string {
  const quote = text[0]
  if ((quote !== '"' && quote !== "'") || text.at(-1) !== quote) {
    throw syntax_error(node, "Invalid string literal")
  }
  let result = ""
  for (let i = 1; i < text.length - 1; i++) {
    const char = text[i]
    if (char !== "\\") {
      result += char
      continue
    }
    const escape = text[++i]
    const simple: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "0": "\0",
    }
    if (escape in simple) {
      if (escape === "0" && /[0-9]/.test(text[i + 1]))
        throw syntax_error(node, "Legacy octal escape")
      result += simple[escape]
    } else if (escape === "\n" || escape === "\u2028" || escape === "\u2029") {
      continue
    } else if (escape === "\r") {
      if (text[i + 1] === "\n") i++
    } else if (escape === "x" || escape === "u") {
      let digits
      if (escape === "u" && text[i + 1] === "{") {
        const end = text.indexOf("}", i + 2)
        if (end === -1) throw syntax_error(node, "Invalid Unicode escape")
        digits = text.slice(i + 2, end)
        i = end
      } else {
        const count = escape === "x" ? 2 : 4
        digits = text.slice(i + 1, i + count + 1)
        if (digits.length !== count)
          throw syntax_error(node, "Invalid string escape")
        i += count
      }
      if (
        !/^[0-9a-f]+$/i.test(digits) ||
        Number.parseInt(digits, 16) > 0x10ffff
      ) {
        throw syntax_error(node, "Invalid Unicode escape")
      }
      result += String.fromCodePoint(Number.parseInt(digits, 16))
    } else {
      if (/[1-9]/.test(escape))
        throw syntax_error(node, "Legacy numeric escape")
      result += escape
    }
  }
  return result
}

export type Literal = string | number | boolean | null | undefined

export type FunctionId = Brand<number, "FunctionId">

export interface FunctionDescriptor {
  id: FunctionId
  name: string
  params: number
  length: number
  flags: number
  parameter_slots: number[]
  rest_slot: number | null
  arguments_slot: number | null
  binding_flags: boolean[]
  binding_count: number
  slot_count: number
  bytecode: Uint8Array
}

export interface ExportBinding {
  name: string
  slot: number
}

export interface ImportBinding {
  imported: string
  slot: number
}

export interface CompiledModule {
  path: string
  functions: FunctionDescriptor[]
  literals: Literal[]
  imports: { specifier: string; bindings: ImportBinding[] }[]
  exports: ExportBinding[]
  entry: FunctionId
}

export interface CompilerState {
  unit: CompiledModule
  prepared: WeakSet<object>
}

export function compile_module(
  source: string,
  path: string = "<module>",
): CompiledModule {
  const ast = parse_source_file(QualifiedName(), path, source)
  if (ast.errors.length) throw located_error(path, source, ast.errors)
  const unit: CompiledModule = {
    path,
    functions: [],
    literals: [],
    imports: [],
    exports: [],
    entry: 0 as FunctionId,
  }
  const state = { unit, prepared: new WeakSet() }
  try {
    compile_function(state, null, null, ast.stmts, "<module>", [])
  } catch (error) {
    if (!(error instanceof SyntaxError) || !(error as SourceDiagnostic).span)
      throw error
    throw located_error(path, source, [error])
  }
  for (const fn of unit.functions) {
    Object.freeze(fn.binding_flags)
    Object.freeze(fn.parameter_slots)
    // A typed array cannot be frozen. Expose a fresh copy so compilation output
    // remains immutable even if a consumer modifies its instruction view.
    const bytecode = fn.bytecode
    Object.defineProperty(fn, "bytecode", {
      get: () => bytecode.slice(),
      enumerable: true,
    })
    Object.freeze(fn)
  }
  for (const item of unit.imports) {
    item.bindings.forEach(Object.freeze)
    Object.freeze(item.bindings)
    Object.freeze(item)
  }
  unit.exports.forEach(Object.freeze)
  for (const key of ["functions", "literals", "imports", "exports"])
    Object.freeze(unit[key as keyof CompiledModule])
  return Object.freeze(unit)
}

function located_error(
  path: string,
  source: string,
  errors: readonly SourceDiagnostic[],
): SyntaxError {
  const message = [...errors]
    .sort((a, b) => a.span!.start - b.span!.start)
    .map((error) => {
      const [line, col] = offset_to_line_and_col(source, error.span!.start)
      return `${path}:${line}:${col}: ${error.message}\n${preview_lines(source, error.span!, false)}`
    })
    .join("\n\n")
  return new SyntaxError(message)
}

function unsupported(
  node: SourceNode,
  description: string = node.kind!,
): never {
  throw syntax_error(node, `Unsupported syntax: ${description}`)
}

function syntax_error(
  node: SourceNode,
  message: string,
): SyntaxError & SourceDiagnostic {
  return Object.assign(new SyntaxError(message), { span: node?.span })
}

function literal(state: CompilerState, value: Literal) {
  const found = state.unit.literals.findIndex((item) => Object.is(item, value))
  if (found !== -1) return found
  return state.unit.literals.push(value) - 1
}

function allocate(fn: FunctionBuilder, count: number = 1) {
  const slot = fn.slot_count
  fn.slot_count += count
  return slot
}

function emit(fn: FunctionBuilder, opcode: number, ...operands: number[]) {
  const index = fn.instructions.length
  fn.instructions.push([opcode, ...operands])
  return index
}

function position(fn: FunctionBuilder) {
  return fn.instructions.length * INSTRUCTION_BYTES
}

function constant(state: CompilerState, fn: FunctionBuilder, value: Literal) {
  const dst = allocate(fn)
  emit(fn, OP.LOAD_CONST, dst, literal(state, value))
  return dst
}

function declare_pattern(scope: Scope, pattern: Pattern, readonly: boolean) {
  if (pattern.kind !== "Var") unsupported(pattern, "binding destructuring")
  return declare_binding(scope, pattern.ident.text, readonly)
}

function export_binding(
  state: CompilerState,
  node: SourceNode,
  name: string,
  slot: number,
) {
  if (state.unit.exports.some((item) => item.name === name))
    throw syntax_error(node, `Duplicate export: ${name}`)
  state.unit.exports.push({ name, slot })
}

export type ExportName =
  | { kind: "Ident"; ident: Ident }
  | { kind: "String"; text: string }

function export_name(node: SourceNode, name: ExportName) {
  return name.kind === "Ident"
    ? name.ident.text
    : decode_string(name.text, node)
}

function prepare_statements(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  stmts: readonly Stmt[],
) {
  const local_exports = []
  for (const stmt of stmts) {
    state.prepared.add(stmt)
    switch (stmt.kind) {
      case "VarDecl":
        if (stmt.decl.decl_type === "Var") unsupported(stmt, "var declarations")
        for (const item of stmt.decl.declarators) {
          const binding = declare_pattern(
            scope,
            item.pattern,
            stmt.decl.decl_type === "Const",
          )
          if (stmt.decl.is_exported) {
            if (fn.id !== 0 || scope !== fn.scope)
              unsupported(stmt, "nested export")
            export_binding(state, stmt, binding.name, binding.slot)
          }
        }
        break
      case "ClassDecl": {
        const name = stmt.class_def.name?.text
        if (!name) throw syntax_error(stmt, "A class declaration needs a name")
        const binding = declare_binding(scope, name)
        if (stmt.is_exported) {
          if (fn.id !== 0 || scope !== fn.scope)
            unsupported(stmt, "nested export")
          export_binding(state, stmt, name, binding.slot)
        }
        break
      }
      case "Func": {
        if (!stmt.func.name)
          throw syntax_error(stmt, "A function declaration needs a name")
        const binding = declare_binding(scope, stmt.func.name!.text)
        if (stmt.is_exported) {
          if (fn.id !== 0 || scope !== fn.scope)
            unsupported(stmt, "nested export")
          export_binding(state, stmt, binding.name, binding.slot)
        }
        break
      }
      case "ExportDefault": {
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested export")
        const binding = declare_binding(scope, "*default*", true)
        export_binding(state, stmt, "default", binding.slot)
        break
      }
      case "Import": {
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested import")
        const bindings = []
        if (stmt.default_import) {
          bindings.push({
            imported: "default",
            slot: declare_binding(scope, stmt.default_import.text, true).slot,
          })
        }
        for (const item of stmt.named_imports) {
          if (item.type_only) unsupported(stmt, "type-only imports")
          const imported =
            item.imported_name.kind === "Ident"
              ? item.imported_name.ident.text
              : decode_string(item.imported_name.text, item)
          const local = item.as_name?.text ?? imported
          bindings.push({
            imported,
            slot: declare_binding(scope, local, true).slot,
          })
        }
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier, stmt),
          bindings,
        })
        break
      }
      case "ExportNamed": {
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested export")
        if (stmt.module_specifier === null) {
          // Local exports may name bindings declared later in the module.
          local_exports.push(stmt)
          break
        }
        const bindings = []
        for (const item of stmt.specifiers) {
          const exported = export_name(item, item.as_name ?? item.local_name)
          // A re-export is an import into a slot no source name can reach.
          const slot = declare_binding(scope, `*export ${exported}*`, true).slot
          bindings.push({ imported: export_name(item, item.local_name), slot })
          export_binding(state, item, exported, slot)
        }
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier, stmt),
          bindings,
        })
        break
      }
    }
  }
  for (const stmt of local_exports) {
    for (const item of stmt.specifiers) {
      if (item.local_name.kind !== "Ident")
        throw syntax_error(item, "A local export must name a binding")
      const name = item.local_name.ident.text
      const binding = scope.bindings.get(name)
      if (!binding)
        throw syntax_error(item, `Cannot export unknown binding: ${name}`)
      export_binding(
        state,
        item,
        export_name(item, item.as_name ?? item.local_name),
        binding.slot,
      )
    }
  }
}

export interface FunctionBuilder {
  id: FunctionId
  name: string
  params: number
  length: number
  parameter_slots: number[]
  rest_slot: number | null
  arguments_slot: number | null
  binding_flags: boolean[]
  binding_count: number
  slot_count: number
  instructions: Instruction[]
  parent: FunctionBuilder | null
  scope: Scope | null
  flags: number
}

export interface FunctionOptions {
  flags?: number
  build?: (fn: FunctionBuilder, scope: Scope) => void
}

function compile_function(
  state: CompilerState,
  parent: FunctionBuilder | null,
  parent_scope: Scope | null,
  stmts: readonly Stmt[],
  name: string,
  params: readonly Param[],
  expression_body: Expr | null = null,
  options: FunctionOptions = {},
): FunctionId {
  const fn: FunctionBuilder = {
    id: state.unit.functions.length as FunctionId,
    name,
    params: params.length,
    length: params.length,
    parameter_slots: [],
    rest_slot: null,
    arguments_slot: null,
    binding_flags: [],
    binding_count: 0,
    slot_count: 0,
    instructions: [],
    parent,
    scope: null,
    flags: options.flags ?? 0,
  }
  state.unit.functions.push(null!)
  const scope = create_scope(parent_scope, fn)
  fn.scope = scope
  const defaults = []
  for (const [index, param] of params.entries()) {
    const { pattern, initializer } =
      param.pattern.kind === "Assignment" ? param.pattern : param
    if (initializer || pattern.kind === "Rest")
      fn.length = Math.min(fn.length, index)
    if (pattern.kind === "Rest") {
      if (index !== params.length - 1 || initializer)
        throw syntax_error(
          param,
          "A rest parameter must be last and cannot have a default",
        )
      fn.rest_slot = declare_pattern(scope, pattern.pattern, false).slot
      continue
    }
    const slot = declare_pattern(scope, pattern, false).slot
    fn.parameter_slots.push(slot)
    if (initializer) defaults.push({ slot, initializer })
  }
  if (options.build) options.build(fn, scope)
  for (const { slot, initializer } of defaults) {
    const value = allocate(fn)
    emit(fn, OP.LOAD_BINDING, value, 0, slot)
    const missing = allocate(fn)
    emit(
      fn,
      OP.BINARY_OP,
      missing,
      value,
      constant(state, fn, undefined),
      literal(state, "==="),
    )
    const skip = emit(fn, OP.JUMP_IF_FALSY, missing, 0)
    emit(
      fn,
      OP.STORE_BINDING,
      0,
      slot,
      compile_expr(state, fn, scope, initializer),
    )
    fn.instructions[skip][2] = position(fn)
  }
  prepare_statements(state, fn, scope, stmts)
  compile_statements(state, fn, scope, stmts)
  if (expression_body)
    emit(fn, OP.RETURN, compile_expr(state, fn, scope, expression_body))
  emit(fn, OP.RETURN, constant(state, fn, undefined))
  const descriptor = {
    id: fn.id,
    name: fn.name,
    params: fn.params,
    length: fn.length,
    flags: fn.flags,
    binding_count: fn.binding_flags.length,
    binding_flags: fn.binding_flags,
    parameter_slots: fn.parameter_slots,
    rest_slot: fn.rest_slot,
    arguments_slot: fn.arguments_slot,
    slot_count: fn.slot_count,
    bytecode: encode_instructions(fn.instructions),
  }
  state.unit.functions[fn.id] = descriptor
  return fn.id
}

function function_value(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  func: Func,
  name: string = "",
  flags: number = 0,
) {
  if (func.is_generator) unsupported(func, "generator functions")
  const id = compile_function(
    state,
    fn,
    scope,
    func.body.stmts,
    name,
    func.params,
    null,
    { flags: func.is_async ? flags | 8 : flags },
  )
  const dst = allocate(fn)
  emit(fn, OP.CREATE_CLOSURE, dst, id)
  return dst
}

function compile_statements(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  stmts: readonly Stmt[],
) {
  // Declarations initialize before statements, allowing calls before declaration.
  for (const stmt of stmts) {
    if (stmt.kind === "Func") {
      const value = function_value(
        state,
        fn,
        scope,
        stmt.func,
        stmt.func.name!.text,
      )
      emit(
        fn,
        OP.INIT_BINDING,
        0,
        scope.bindings.get(stmt.func.name!.text)!.slot,
        value,
      )
    }
  }
  for (const stmt of stmts) {
    if (
      stmt.kind !== "Func" &&
      stmt.kind !== "Import" &&
      stmt.kind !== "ExportNamed"
    )
      compile_stmt(state, fn, scope, stmt)
  }
}

function compile_stmt(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  stmt: Stmt | { kind: "Block"; block: import("djs_ast").Block },
): void {
  if (
    ["VarDecl", "ExportDefault", "ClassDecl"].includes(stmt.kind) &&
    !state.prepared.has(stmt)
  ) {
    unsupported(stmt, "declaration outside a block")
  }
  switch (stmt.kind) {
    case "Empty":
      return
    case "Func":
      unsupported(stmt, "function declarations outside blocks")
      break
    case "Import":
      unsupported(stmt, "nested import")
      break
    case "Expr":
      compile_expr(state, fn, scope, stmt.expr)
      return
    case "VarDecl":
      for (const item of stmt.decl.declarators) {
        const value = item.init
          ? compile_expr(state, fn, scope, item.init)
          : constant(state, fn, undefined)
        if (!item.init && stmt.decl.decl_type === "Const")
          throw syntax_error(stmt, "Missing const initializer")
        emit(
          fn,
          OP.INIT_BINDING,
          0,
          scope.bindings.get(
            (item.pattern as Extract<Pattern, { kind: "Var" }>).ident.text,
          )!.slot,
          value,
        )
      }
      return
    case "ClassDecl": {
      const value = class_value(state, fn, scope, stmt.class_def)
      emit(
        fn,
        OP.INIT_BINDING,
        0,
        scope.bindings.get(stmt.class_def.name!.text)!.slot,
        value,
      )
      return
    }
    case "Try": {
      const exception = allocate(fn)
      const start = emit(fn, OP.TRY, 0xffffffff, 0xffffffff, 0, exception)
      compile_stmt(state, fn, scope, { kind: "Block", block: stmt.try_block })
      emit(fn, OP.LEAVE_TRY)
      if (stmt.catch_block) {
        fn.instructions[start][1] = position(fn)
        const child = create_scope(scope, fn)
        if (stmt.catch_pattern) {
          const binding = declare_pattern(child, stmt.catch_pattern, false)
          emit(fn, OP.INIT_BINDING, 0, binding.slot, exception)
        }
        prepare_statements(state, fn, child, stmt.catch_block.stmts)
        compile_statements(state, fn, child, stmt.catch_block.stmts)
        emit(fn, OP.LEAVE_TRY)
      }
      if (stmt.finally_block) {
        fn.instructions[start][2] = position(fn)
        compile_stmt(state, fn, scope, {
          kind: "Block",
          block: stmt.finally_block,
        })
        emit(fn, OP.END_FINALLY)
      }
      fn.instructions[start][3] = position(fn)
      return
    }
    case "ExportDefault":
      emit(
        fn,
        OP.INIT_BINDING,
        0,
        scope.bindings.get("*default*")!.slot,
        compile_expr(state, fn, scope, stmt.value),
      )
      return
    case "Return":
      if (fn.id === 0)
        throw syntax_error(stmt, "Illegal return at module top level")
      emit(
        fn,
        OP.RETURN,
        stmt.value
          ? compile_expr(state, fn, scope, stmt.value)
          : constant(state, fn, undefined),
      )
      return
    case "Block": {
      const child = create_scope(scope, fn)
      prepare_statements(state, fn, child, stmt.block.stmts)
      compile_statements(state, fn, child, stmt.block.stmts)
      return
    }
    case "If": {
      const condition = compile_expr(state, fn, scope, stmt.condition)
      const branch = emit(fn, OP.JUMP_IF_FALSY, condition, 0)
      compile_stmt(state, fn, scope, stmt.if_true)
      if (stmt.if_false) {
        const end = emit(fn, OP.JUMP, 0)
        fn.instructions[branch][2] = position(fn)
        compile_stmt(state, fn, scope, stmt.if_false)
        fn.instructions[end][1] = position(fn)
      } else fn.instructions[branch][2] = position(fn)
      return
    }
    case "While": {
      // A new per-iteration lexical environment needs dedicated bytecode. Reject
      // loop-local declarations until that environment operation is available.
      if (contains_declaration(stmt.body))
        unsupported(stmt, "loop-local declarations")
      const start = position(fn)
      const condition = compile_expr(state, fn, scope, stmt.condition)
      const end = emit(fn, OP.JUMP_IF_FALSY, condition, 0)
      compile_stmt(state, fn, scope, stmt.body)
      emit(fn, OP.JUMP, start)
      fn.instructions[end][2] = position(fn)
      return
    }
    default:
      unsupported(stmt)
  }
}

function contains_declaration(stmt: Stmt): boolean | null {
  if (["VarDecl", "Func", "ClassDecl"].includes(stmt.kind)) return true
  if (stmt.kind === "Block") return stmt.block.stmts.some(contains_declaration)
  if (stmt.kind === "If")
    return (
      contains_declaration(stmt.if_true) ||
      (stmt.if_false && contains_declaration(stmt.if_false))
    )
  if (stmt.kind === "While") return contains_declaration(stmt.body)
  if (stmt.kind === "Try")
    return (
      Boolean(stmt.catch_pattern) ||
      [stmt.try_block, stmt.catch_block, stmt.finally_block].some((block) =>
        block?.stmts.some(contains_declaration),
      )
    )
  return false
}

const binary_operators: Record<string, string> = {
  In: "in",
  Add: "+",
  Sub: "-",
  Mul: "*",
  Div: "/",
  Mod: "%",
  Exponent: "**",
  BitXor: "^",
  BitAnd: "&",
  BitOr: "|",
  Gt: ">",
  Lt: "<",
  Gte: ">=",
  Lte: "<=",
  EqEq: "==",
  EqEqEq: "===",
  NotEq: "!=",
  NotEqEq: "!==",
  LeftShift: "<<",
  RightShift: ">>",
  UnsignedRightShift: ">>>",
  Instanceof: "instanceof",
}

function resolve_name(scope: Scope, name: string): ResolvedBinding | null {
  if (name === "arguments") {
    for (let current: Scope | null = scope; current; current = current.parent) {
      if (current.bindings.has(name)) break
      const owner: FunctionBuilder = current.owner
      if (current === owner.scope && owner.parent && !(owner.flags & 4)) {
        // Ordinary functions own arguments; arrows inherit the nearest binding.
        owner.arguments_slot = declare_binding(current, name).slot
        break
      }
    }
  }
  return resolve_binding(scope, name)
}

function load_name(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  name: string,
  allow_missing: boolean = false,
) {
  const dst = allocate(fn)
  if (name === "this") {
    emit(fn, OP.LOAD_THIS, dst)
    return dst
  }
  const binding = resolve_name(scope, name)
  if (binding) emit(fn, OP.LOAD_BINDING, dst, binding.depth, binding.slot)
  else
    emit(fn, OP.LOAD_GLOBAL, dst, literal(state, name), allow_missing ? 1 : 0)
  return dst
}

function property_key(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  key: ObjectKey,
) {
  if (key.kind === "Ident") return constant(state, fn, key.ident.text)
  if (key.kind === "String") {
    // The parser uses String keys for both quoted and numeric property names.
    const text = key.text
    const name =
      text[0] === '"' || text[0] === "'"
        ? decode_string(text, key)
        : String(Number(text.replaceAll("_", "")))
    return constant(state, fn, name)
  }
  if (key.kind === "Computed") {
    const value = compile_expr(state, fn, scope, key.expr)
    const name = allocate(fn)
    emit(fn, OP.TO_PROPERTY_KEY, name, value)
    return name
  }
  unsupported(key)
}

function set_function_name(
  state: CompilerState,
  fn: FunctionBuilder,
  value: number,
  key: number,
  accessor?: import("djs_ast").AccessorType | null,
) {
  let name = key
  if (accessor) {
    name = allocate(fn)
    emit(
      fn,
      OP.BINARY_OP,
      name,
      constant(state, fn, accessor === "Set" ? "set " : "get "),
      key,
      literal(state, "+"),
    )
  }
  emit(fn, OP.DEFINE_PROP, value, constant(state, fn, "name"), name, 4)
}

function property_reference(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: PropExpr | IndexExpr,
) {
  if (expr.is_optional) unsupported(expr, "optional chaining")
  const object = compile_expr(state, fn, scope, expr.lhs)
  const key =
    expr.kind === "Prop"
      ? expr.property.text.startsWith("#")
        ? private_name(state, fn, scope, expr.property)
        : constant(state, fn, expr.property.text)
      : compile_expr(state, fn, scope, expr.property)
  return {
    object,
    key,
    private: expr.kind === "Prop" && expr.property.text.startsWith("#"),
  }
}

function compile_expr(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: Expr,
): number {
  switch (expr.kind) {
    case "String":
      return constant(state, fn, decode_string(expr.text, expr))
    case "TemplateLiteral": {
      let result: number | undefined
      for (const fragment of expr.fragments) {
        let value: number
        if (fragment.kind === "Text") {
          const body = fragment.text
            .replace(/^[`}]/, "")
            .replace(/(\$\{|`)$/, "")
            .replace(/\r\n?/g, "\n")
          if (result !== undefined && body === "") continue
          value = constant(state, fn, decode_string(`"${body}"`, fragment))
        } else {
          value = compile_expr(state, fn, scope, fragment.expr)
        }
        if (result === undefined) {
          result = value
        } else {
          const dst = allocate(fn)
          emit(fn, OP.BINARY_OP, dst, result, value, literal(state, "+"))
          result = dst
        }
      }
      return result!
    }
    case "Number": {
      if (expr.text.endsWith("n")) unsupported(expr, "bigint literals")
      const value = Number(expr.text.replaceAll("_", ""))
      if (Number.isNaN(value))
        throw syntax_error(expr, "Invalid number literal")
      return constant(state, fn, value)
    }
    case "Boolean":
      return constant(state, fn, expr.value)
    case "Null":
      return constant(state, fn, null)
    case "Undefined":
      return constant(state, fn, undefined)
    case "Var":
      return load_name(state, fn, scope, expr.ident.text)
    case "Paren":
      return compile_expr(state, fn, scope, expr.expr)
    case "Prop":
    case "Index": {
      const reference = property_reference(state, fn, scope, expr)
      const dst = allocate(fn)
      emit(
        fn,
        reference.private ? OP.GET_PRIVATE : OP.GET_PROP,
        dst,
        reference.object,
        reference.key,
      )
      return dst
    }
    case "Call": {
      if (expr.is_optional || expr.spread)
        unsupported(expr, "optional/spread calls")
      let callee, receiver
      let target = expr.callee
      while (target.kind === "Paren") target = target.expr
      const construct = target.kind === "New"
      if (construct) {
        callee = compile_expr(
          state,
          fn,
          scope,
          (target as Extract<Expr, { kind: "New" }>).expr,
        )
        receiver = constant(state, fn, undefined)
      } else if (target.kind === "Prop" || target.kind === "Index") {
        const reference = property_reference(state, fn, scope, target)
        receiver = reference.object
        callee = allocate(fn)
        emit(
          fn,
          reference.private ? OP.GET_PRIVATE : OP.GET_PROP,
          callee,
          receiver,
          reference.key,
        )
      } else {
        callee = compile_expr(state, fn, scope, expr.callee)
        receiver = constant(state, fn, undefined)
      }
      const args = allocate(fn, expr.args.length)
      for (let i = 0; i < expr.args.length; i++) {
        emit(
          fn,
          OP.MOVE,
          args + i,
          compile_expr(state, fn, scope, expr.args[i]),
        )
      }
      const dst = allocate(fn)
      emit(
        fn,
        construct ? OP.CONSTRUCT : OP.CALL,
        dst,
        callee,
        receiver,
        args,
        expr.args.length,
      )
      return dst
    }
    case "Array": {
      const dst = allocate(fn)
      emit(fn, OP.CREATE_ARRAY, dst, expr.items.length)
      for (let index = 0; index < expr.items.length; index++) {
        const item = expr.items[index]
        if (item.kind === "Elision") continue
        if (item.kind === "Spread") unsupported(item, "array spread")
        const key = constant(state, fn, String(index))
        const value = compile_expr(state, fn, scope, item.expr)
        emit(fn, OP.DEFINE_PROP, dst, key, value, 7)
      }
      return dst
    }
    case "NewTarget": {
      let owner: FunctionBuilder | null = fn
      while (owner && owner.flags & 4) owner = owner.parent
      if (!owner?.parent)
        throw syntax_error(expr, "new.target requires a function")
      const dst = allocate(fn)
      emit(fn, OP.LOAD_NEW_TARGET, dst)
      return dst
    }
    case "Delete": {
      let target = expr.expr
      while (target.kind === "Paren") target = target.expr
      const dst = allocate(fn)
      if (target.kind === "Prop" || target.kind === "Index") {
        const reference = property_reference(state, fn, scope, target)
        if (reference.private)
          throw syntax_error(expr, "Cannot delete a private field")
        emit(fn, OP.DELETE_PROP, dst, reference.object, reference.key)
      } else {
        if (target.kind === "Var")
          throw syntax_error(expr, "Cannot delete a binding in strict mode")
        compile_expr(state, fn, scope, target)
        emit(fn, OP.LOAD_CONST, dst, literal(state, true))
      }
      return dst
    }
    case "Object": {
      const dst = allocate(fn)
      emit(fn, OP.CREATE_OBJECT, dst)
      for (const entry of expr.entries) {
        let key, value
        if (entry.kind === "Ident") {
          key = constant(state, fn, entry.ident.text)
          value = load_name(state, fn, scope, entry.ident.text)
        } else if (entry.kind === "Prop") {
          key = property_key(state, fn, scope, entry.key)
          value = compile_expr(state, fn, scope, entry.value)
        } else if (entry.kind === "Method") {
          key = property_key(state, fn, scope, entry.method.name)
          value = function_value(
            state,
            fn,
            scope,
            entry.method.body,
            "<method>",
            2,
          )
          set_function_name(state, fn, value, key, entry.method.accessor_type)
        } else unsupported(entry)
        if (entry.kind === "Method" && entry.method.accessor_type)
          emit(
            fn,
            OP.DEFINE_PROP,
            dst,
            key,
            value,
            7 | 16,
            entry.method.accessor_type === "Set" ? 1 : 0,
          )
        else emit(fn, OP.DEFINE_PROP, dst, key, value, 7)
      }
      return dst
    }
    case "Func":
      if (expr.func.name) unsupported(expr, "named function expressions")
      return function_value(state, fn, scope, expr.func)
    case "ArrowFn": {
      const id = compile_function(
        state,
        fn,
        scope,
        expr.body.kind === "Block" ? expr.body.block.stmts : [],
        "",
        expr.params,
        expr.body.kind === "Expr" ? expr.body.expr : null,
        { flags: 4 },
      )
      const dst = allocate(fn)
      emit(fn, OP.CREATE_CLOSURE, dst, id)
      return dst
    }
    case "Class":
      return class_value(state, fn, scope, expr.class_def)
    case "New": {
      const callee = compile_expr(state, fn, scope, expr.expr)
      const dst = allocate(fn)
      emit(fn, OP.CONSTRUCT, dst, callee, constant(state, fn, undefined), 0, 0)
      return dst
    }
    case "PrivateName":
      throw syntax_error(expr, "Private name must be used in a brand check")
    case "Await": {
      if (fn.id !== 0 && !(fn.flags & 8))
        unsupported(expr, "await inside an ordinary function")
      const value = compile_expr(state, fn, scope, expr.expr)
      const dst = allocate(fn)
      emit(fn, OP.AWAIT, dst, value)
      return dst
    }
    case "Throw": {
      const value = compile_expr(state, fn, scope, expr.value)
      emit(fn, OP.THROW, value)
      return value
    }
    case "BinOp": {
      if (expr.operator === "And" || expr.operator === "Or") {
        const dst = allocate(fn)
        emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.lhs))
        const branch = emit(fn, OP.JUMP_IF_FALSY, dst, 0)
        let end
        if (expr.operator === "Or") {
          end = emit(fn, OP.JUMP, 0)
          fn.instructions[branch][2] = position(fn)
        }
        emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.rhs))
        fn.instructions[end ?? branch][end === undefined ? 2 : 1] = position(fn)
        return dst
      }
      if (expr.lhs.kind === "PrivateName") {
        if (expr.operator !== "In")
          throw syntax_error(expr, "Private name must be used in a brand check")
        const key = private_name(state, fn, scope, expr.lhs.ident)
        const object = compile_expr(state, fn, scope, expr.rhs)
        const dst = allocate(fn)
        emit(fn, OP.HAS_PRIVATE, dst, object, key)
        return dst
      }
      const operator = binary_operators[expr.operator]
      if (!operator) unsupported(expr, `binary ${expr.operator}`)
      const left = compile_expr(state, fn, scope, expr.lhs)
      const right = compile_expr(state, fn, scope, expr.rhs)
      const dst = allocate(fn)
      emit(fn, OP.BINARY_OP, dst, left, right, literal(state, operator))
      return dst
    }
    case "Assign": {
      if (expr.operator !== "Eq") unsupported(expr, "compound assignment")
      const pattern = expr.pattern
      if (pattern.kind === "Var") {
        const binding = resolve_name(scope, pattern.ident.text)
        if (!binding)
          throw syntax_error(
            pattern,
            `Assignment to undeclared binding: ${pattern.ident.text}`,
          )
        const value = compile_expr(state, fn, scope, expr.value)
        emit(fn, OP.STORE_BINDING, binding.depth, binding.slot, value)
        return value
      }
      if (pattern.kind === "Prop") {
        const object = compile_expr(state, fn, scope, pattern.expr)
        const is_private = pattern.key.kind === "Private"
        const key = is_private
          ? private_name(state, fn, scope, pattern.key.ident)
          : property_key(state, fn, scope, pattern.key)
        const value = compile_expr(state, fn, scope, expr.value)
        emit(fn, is_private ? OP.SET_PRIVATE : OP.SET_PROP, object, key, value)
        return value
      }
      unsupported(pattern, "assignment destructuring")
      break
    }
    case "Ternary": {
      const dst = allocate(fn)
      const condition = compile_expr(state, fn, scope, expr.condition)
      const branch = emit(fn, OP.JUMP_IF_FALSY, condition, 0)
      emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.if_true))
      const end = emit(fn, OP.JUMP, 0)
      fn.instructions[branch][2] = position(fn)
      emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.if_false))
      fn.instructions[end][1] = position(fn)
      return dst
    }
    case "Comma": {
      let value
      for (const item of expr.items)
        value = compile_expr(state, fn, scope, item)
      return value!
    }
    case "Not":
    case "BitNot":
    case "UnaryPlus":
    case "UnaryMinus":
    case "TypeOf":
    case "Void": {
      const operator = {
        Not: "!",
        BitNot: "~",
        UnaryPlus: "+",
        UnaryMinus: "-",
        TypeOf: "typeof",
        Void: "void",
      }[expr.kind]
      let operand = expr.expr
      while (operand.kind === "Paren") operand = operand.expr
      const value =
        expr.kind === "TypeOf" && operand.kind === "Var"
          ? load_name(state, fn, scope, operand.ident.text, true)
          : compile_expr(state, fn, scope, expr.expr)
      const dst = allocate(fn)
      emit(fn, OP.UNARY_OP, dst, value, literal(state, operator))
      return dst
    }
    default:
      unsupported(expr)
  }
}

function private_name(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  ident: Ident,
) {
  for (let current: Scope | null = scope; current; current = current.parent) {
    const binding = current.private_names?.get(ident.text)
    if (binding) return load_name(state, fn, scope, binding)
  }
  throw syntax_error(ident, `Undeclared private name: ${ident.text}`)
}

// Intrinsic decorators are compile-time declarations, never evaluated as JS.
function intrinsic_decorator(node: Expr, name: string) {
  if (
    node.kind !== "Call" ||
    node.callee.kind !== "Var" ||
    node.callee.ident.text !== name ||
    node.spread ||
    node.is_optional
  )
    throw syntax_error(node, `Expected @${name}(...) intrinsic annotation`)
  return node.args
}

export interface BuiltinClass {
  name: string
  prototype: string
  length: number | null
  hooks: Map<ClassElement, number>
}

/** A class element view lets the compiler inspect optional method/field parts. */
export interface ClassElement {
  span: Span
  decorators: readonly Expr[]
  name: import("djs_ast").ObjectKey & { ident?: Ident }
  is_static: boolean
  body?: Func
  initializer?: Expr | null
  accessor_type?: import("djs_ast").AccessorType | null
}

export type ClassDefinition = Omit<Class, "body"> & {
  body: { members: readonly { method?: ClassElement; field?: ClassElement }[] }
}

function builtin_class(cls: ClassDefinition): BuiltinClass | null {
  if (!cls.decorators.length) return null
  if (cls.decorators.length !== 1)
    throw syntax_error(cls, "Expected one @builtin annotation")
  const args = intrinsic_decorator(cls.decorators[0], "builtin")
  if (args.length !== 1 || args[0].kind !== "Object")
    throw syntax_error(cls, "@builtin requires a literal options object")
  const options: Omit<BuiltinClass, "hooks"> = {
    name: cls.name?.text!,
    prototype: "object",
    length: null,
  }
  const seen = new Set()
  for (const entry of args[0].entries) {
    if (
      entry.kind !== "Prop" ||
      entry.key.kind !== "Ident" ||
      !["name", "prototype", "length"].includes(entry.key.ident.text) ||
      seen.has(entry.key.ident.text)
    )
      throw syntax_error(entry, "Invalid or duplicate @builtin option")
    const key = entry.key.ident.text
    seen.add(key)
    if (key === "length") {
      if (
        entry.value.kind !== "Number" ||
        !Number.isSafeInteger(Number(entry.value.text)) ||
        Number(entry.value.text) < 0
      )
        throw syntax_error(
          entry,
          "Builtin length must be a non-negative integer",
        )
      options.length = Number(entry.value.text)
    } else {
      if (entry.value.kind !== "String")
        throw syntax_error(entry, "Builtin options must be literals")
      options[key as "name" | "prototype"] = decode_string(
        entry.value.text,
        entry.value,
      )
    }
  }
  if (!options.name || !Object.hasOwn(BUILTIN_PROTOTYPE, options.prototype))
    throw syntax_error(cls, "Invalid builtin name or prototype kind")
  const hooks = new Map<ClassElement, number>()
  const used = new Set()
  for (const item of cls.body.members) {
    const member = (item.method ?? item.field)!
    if (!member.body) {
      if (member.is_static && !member.decorators.length) continue
      throw syntax_error(
        member,
        "Builtin instance layouts and @internalSlot fields are not supported yet",
      )
    }
    if (!member.decorators.length) continue
    if (member.decorators.length !== 1)
      throw syntax_error(member, "Expected one @internalMethod annotation")
    const args = intrinsic_decorator(member.decorators[0], "internalMethod")
    if (args.length !== 1 || args[0].kind !== "String")
      throw syntax_error(
        member,
        "Internal method name must be a string literal",
      )
    const name = decode_string(args[0].text, args[0])
    const id = ["Call", "Construct", "DefineOwnProperty"].indexOf(name)
    if (id < 0 || used.has(name))
      throw syntax_error(member, "Unknown or duplicate internal method")
    if (
      member.name.kind !== "Private" ||
      member.accessor_type ||
      member.body.is_async ||
      member.body.is_generator ||
      member.is_static !== id < 2 ||
      member.body.params.length !== 2
    )
      throw syntax_error(
        member,
        "Internal methods must be private synchronous methods with two parameters; Call/Construct must be static",
      )
    hooks.set(member, id)
    used.add(name)
  }
  return { ...options, hooks }
}

function class_value(
  state: CompilerState,
  parent: FunctionBuilder,
  parent_scope: Scope,
  cls: ClassDefinition,
): number {
  const builtin = builtin_class(cls)
  if (!builtin)
    for (const item of cls.body.members) {
      const member = (item.method ?? item.field)!
      if (member.decorators.length)
        throw syntax_error(member, "Internal annotations require @builtin")
    }
  if (cls.superclass) unsupported(cls, "class inheritance")
  const id = compile_function(
    state,
    parent,
    parent_scope,
    [],
    "<class>",
    [],
    null,
    {
      flags: 4,
      build(fn: FunctionBuilder, scope: Scope) {
        const name = cls.name?.text ?? "*class*"
        declare_binding(scope, name, true)
        scope.private_names = new Map()
        const members = cls.body.members.map(
          (member) => (member.method ?? member.field)!,
        )
        for (const member of members) {
          const public_name =
            member.name.kind === "Ident"
              ? member.name.ident.text
              : member.name.kind === "String"
                ? decode_string(member.name.text, member.name)
                : null
          if (
            (member.is_static && public_name === "prototype") ||
            (!member.is_static && !member.body && public_name === "constructor")
          )
            throw syntax_error(member, `Invalid class element: ${public_name}`)
          if (member.name.kind !== "Private") continue
          const name = member.name.ident.text
          if (name === "#constructor" || scope.private_names.has(name))
            throw syntax_error(
              member,
              `Duplicate or invalid private name: ${name}`,
            )
          if (member.accessor_type) unsupported(member, "private accessors")
          const hidden = `*private:${name}*`
          scope.private_names.set(name, hidden)
          const binding = declare_binding(scope, hidden, true)
          const token = allocate(fn)
          emit(fn, OP.CREATE_OBJECT, token)
          emit(fn, OP.INIT_BINDING, 0, binding.slot, token)
        }
        const keys = new Map<ClassElement, string>()
        const private_methods = new Map<ClassElement, string>()
        for (let i = 0; i < members.length; i++) {
          const member = members[i]
          if (member.name.kind === "Computed") {
            const hidden = `*key:${i}*`
            const binding = declare_binding(scope, hidden, true)
            emit(
              fn,
              OP.INIT_BINDING,
              0,
              binding.slot,
              property_key(state, fn, scope, member.name),
            )
            keys.set(member, hidden)
          }
          if (member.body && member.name.kind === "Private") {
            const hidden = `*method:${i}*`
            declare_binding(scope, hidden, true)
            private_methods.set(member, hidden)
          }
        }
        const key_of = (
          owner: FunctionBuilder,
          current: Scope,
          member: ClassElement,
        ) =>
          member.name.kind === "Private"
            ? private_name(state, owner, current, member.name.ident)
            : keys.has(member)
              ? load_name(state, owner, current, keys.get(member)!)
              : property_key(state, owner, current, member.name)
        const constructors = members.filter(
          (member) =>
            member.body &&
            !member.is_static &&
            member.name.kind !== "Private" &&
            (member.name.ident?.text ??
              (member.name.kind === "String"
                ? decode_string(member.name.text, member.name)
                : null)) === "constructor",
        )
        if (constructors.length > 1)
          throw syntax_error(constructors[1], "Duplicate constructor")
        const constructor = constructors[0]
        if (
          constructor?.accessor_type ||
          constructor?.body!.is_async ||
          constructor?.body!.is_generator
        )
          throw syntax_error(constructor, "Invalid constructor")
        const constructor_id = compile_function(
          state,
          fn,
          scope,
          constructor?.body!.body.stmts ?? [],
          name,
          constructor?.body!.params ?? [],
          null,
          {
            flags: 1,
            build(owner: FunctionBuilder) {
              const field_scope = create_scope(scope, owner)
              const receiver = load_name(state, owner, field_scope, "this")
              for (const [member, hidden] of private_methods)
                if (!member.is_static && !builtin?.hooks.has(member))
                  emit(
                    owner,
                    OP.INIT_PRIVATE,
                    receiver,
                    key_of(owner, field_scope, member),
                    load_name(state, owner, field_scope, hidden),
                    1,
                  )
              for (const member of members) {
                if (member.body || member.is_static) continue
                if (
                  member.name.kind !== "Private" &&
                  member.name.ident?.text === "constructor"
                )
                  throw syntax_error(member, "Invalid field name: constructor")
                const key = key_of(owner, field_scope, member)
                const value = member.initializer
                  ? compile_expr(state, owner, field_scope, member.initializer)
                  : constant(state, owner, undefined)
                emit(
                  owner,
                  member.name.kind === "Private"
                    ? OP.INIT_PRIVATE
                    : OP.DEFINE_PROP,
                  receiver,
                  key,
                  value,
                  member.name.kind === "Private" ? 0 : 7,
                )
              }
            },
          },
        )
        const ctor = allocate(fn),
          prototype = allocate(fn)
        emit(fn, OP.CREATE_CLOSURE, ctor, constructor_id)
        emit(fn, OP.INIT_BINDING, 0, scope.bindings.get(name)!.slot, ctor)
        if (builtin)
          emit(
            fn,
            OP.INIT_BUILTIN_CLASS,
            ctor,
            prototype,
            BUILTIN_PROTOTYPE[
              builtin.prototype as keyof typeof BUILTIN_PROTOTYPE
            ],
          )
        else emit(fn, OP.CREATE_OBJECT, prototype)
        emit(
          fn,
          OP.DEFINE_PROP,
          ctor,
          constant(state, fn, "prototype"),
          prototype,
          0,
        )
        emit(
          fn,
          OP.DEFINE_PROP,
          ctor,
          constant(state, fn, "name"),
          constant(state, fn, builtin?.name ?? cls.name?.text ?? ""),
          4,
        )
        emit(
          fn,
          OP.DEFINE_PROP,
          ctor,
          constant(state, fn, "length"),
          constant(
            state,
            fn,
            builtin?.length ?? state.unit.functions[constructor_id].length,
          ),
          4,
        )
        emit(
          fn,
          OP.DEFINE_PROP,
          prototype,
          constant(state, fn, "constructor"),
          ctor,
          5,
        )
        for (const member of members) {
          if (!member.body || member === constructor) continue
          const value = function_value(
            state,
            fn,
            scope,
            member.body,
            member.name.ident?.text ?? "<method>",
            2,
          )
          const key =
            member.name.kind === "Private"
              ? constant(state, fn, member.name.ident.text)
              : key_of(fn, scope, member)
          set_function_name(state, fn, value, key, member.accessor_type)
          if (builtin?.hooks.has(member))
            emit(
              fn,
              OP.INSTALL_INTERNAL_METHOD,
              ctor,
              value,
              builtin.hooks.get(member)!,
            )
          if (member.name.kind === "Private") {
            emit(
              fn,
              OP.INIT_BINDING,
              0,
              scope.bindings.get(private_methods.get(member)!)!.slot,
              value,
            )
            if (member.is_static)
              emit(
                fn,
                OP.INIT_PRIVATE,
                ctor,
                key_of(fn, scope, member),
                value,
                1,
              )
          } else {
            const flags = 5 | (member.accessor_type ? 16 : 0)
            emit(
              fn,
              OP.DEFINE_PROP,
              member.is_static ? ctor : prototype,
              key,
              value,
              flags,
              member.accessor_type === "Set" ? 1 : 0,
            )
          }
        }
        for (const member of members)
          if (!member.body && member.is_static) {
            // Static field initializers receive the class as this, through a guest call.
            const init_id = compile_function(
              state,
              fn,
              scope,
              [],
              "<static field>",
              [],
              member.initializer,
              { flags: 2 },
            )
            const init = allocate(fn),
              value = allocate(fn)
            emit(fn, OP.CREATE_CLOSURE, init, init_id)
            const key = key_of(fn, scope, member)
            emit(fn, OP.CALL, value, init, ctor, 0, 0)
            emit(
              fn,
              member.name.kind === "Private" ? OP.INIT_PRIVATE : OP.DEFINE_PROP,
              ctor,
              key,
              value,
              member.name.kind === "Private" ? 0 : 7,
            )
          }
        if (builtin)
          emit(
            fn,
            OP.REGISTER_BUILTIN,
            ctor,
            prototype,
            literal(state, builtin.name),
          )
        emit(fn, OP.RETURN, ctor)
      },
    },
  )
  const closure = allocate(parent),
    dst = allocate(parent)
  emit(parent, OP.CREATE_CLOSURE, closure, id)
  emit(parent, OP.CALL, dst, closure, constant(state, parent, undefined), 0, 0)
  return dst
}
