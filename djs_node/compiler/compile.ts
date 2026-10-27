import type { Brand } from "../utils.ts"
import type { Instruction } from "./bytecode.ts"
import type { Binding, Scope, ResolvedBinding, Environment } from "./scopes.ts"
import type {
  Class,
  Span,
  Param,
  Func,
  ObjectKey,
  PropExpr,
  IndexExpr,
  CallExpr,
  Ident,
  ObjectLiteralEntry,
  VarExpr,
  ArrayLiteralMember,
} from "djs_ast"
import {
  Expr,
  Stmt,
  Pattern,
  ASTVisitorBase,
  QualifiedName,
  VarDeclStmt,
  offset_to_line_and_col,
  preview_lines,
} from "djs_ast"
import { parse_source_file } from "djs_parser"
import {
  OP,
  FUNCTION_ENVIRONMENT,
  INSTRUCTION_BYTES,
  NATIVE_MARKERS,
  NO_HOLES,
  FUNCTION_DERIVED,
  encode_instructions,
} from "./bytecode.ts"
import { PROPERTY_FLAGS } from "../vm/storage/layout.ts"
import { create_scope, declare_binding, resolve_binding } from "./scopes.ts"

const { WRITABLE, ENUMERABLE, CONFIGURABLE } = PROPERTY_FLAGS

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

/** Where a parameter lives: a register, or a slot of the function environment. */
export type BindingLocation = { register: number } | { slot: number }

/**
 * A throw from an instruction in [start, end) continues at `target`, with the
 * exception in `register`. `environment` is a block index or
 * FUNCTION_ENVIRONMENT.
 */
export interface ExceptionHandler {
  start: number
  end: number
  target: number
  register: number
  environment: number
}

export interface FunctionDescriptor {
  id: FunctionId
  name: string
  params: number
  length: number
  flags: number
  parameters: BindingLocation[]
  rest: BindingLocation | null
  arguments_slot: number | null
  binding_flags: boolean[]
  binding_count: number
  /** Binding flags of each environment pushed by PUSH_ENV/COPY_ENV. */
  block_binding_flags: boolean[][]
  slot_count: number
  handlers: ExceptionHandler[]
  /** The source offset each instruction was compiled from. */
  source_offsets: number[]
  bytecode: Uint8Array
}

export const PROPERTY_KIND = Object.freeze({ VALUE: 0, GETTER: 1, SETTER: 2 })
export type PropertyKind = (typeof PROPERTY_KIND)[keyof typeof PROPERTY_KIND]

/** `key` is the literal index of a static key, or null for a computed key. */
export interface ObjectTemplate {
  entries: { key: number | null; kind: PropertyKind }[]
}

/** A public method or accessor, keyed as in ObjectTemplate. */
export interface ClassMember {
  function: FunctionId
  key: number | null
  kind: PropertyKind
  is_static: boolean
}

export interface ClassDescriptor {
  constructor_function: FunctionId
  members: ClassMember[]
}

export interface ExportBinding {
  name: string
  slot: number
}

export interface ImportBinding {
  imported: string
  slot: number
  span: Span
}

/** A module-scope binding the realm gives to the VM; see docs/realm.md. */
export type RealmDeclaration =
  | {
      kind: "well_known"
      name: string
      slot: number
      object: "ordinary" | "function" | "array" | "string"
    }
  | { kind: "abstract_operation"; name: string; slot: number }
  | { kind: "internal_method"; object: string; method: string; slot: number }

export interface CompiledModule {
  path: string
  functions: FunctionDescriptor[]
  literals: Literal[]
  /** Module requests in source order. `star_export` marks `export * from`. */
  imports: {
    specifier: string
    bindings: ImportBinding[]
    span: Span
    star_export?: boolean
  }[]
  exports: ExportBinding[]
  realm: RealmDeclaration[]
  object_templates: ObjectTemplate[]
  /** Element indices absent from array literals, for CREATE_ARRAY. */
  array_holes: number[][]
  classes: ClassDescriptor[]
  /** Slot names passed to has_slot, get_slot and set_slot. */
  slot_names: string[]
  /** The source offset of each line's first character. */
  line_starts: number[]
  entry: FunctionId
}

export interface CompilerState {
  unit: CompiledModule
  prepared: WeakSet<object>
  /** Local names of djs:native imports, mapped to the imported names. */
  native_imports: Map<string, string>
  /** Well-known declarations, mapped to the object literal that fills them. */
  well_known: Map<Stmt, Extract<Expr, { kind: "Object" }>>
  /** Module-level marker statements, which compile to nothing. */
  registrations: Set<Stmt>
  /** Names of module-level function declarations. */
  functions: Set<string>
  /** Indices of object templates and hole lists, by their JSON. */
  template_ids: Map<string, number>
}

export function compile_module(
  source: string,
  path: string = "<module>",
  url: string = path,
): CompiledModule {
  const ast = parse_source_file(QualifiedName(), path, source)
  // Like V8, report only the first error. Later ones tend to be cascades.
  if (ast.errors.length) throw located_error(path, source, [ast.errors[0]])
  const unit: CompiledModule = {
    path,
    functions: [],
    literals: [],
    imports: [],
    exports: [],
    realm: [],
    object_templates: [],
    array_holes: [],
    classes: [],
    slot_names: [],
    line_starts: line_starts(source),
    entry: 0 as FunctionId,
  }
  const state: CompilerState = {
    unit,
    prepared: new WeakSet(),
    native_imports: new Map(),
    well_known: new Map(),
    registrations: new Set(),
    functions: new Set(),
    template_ids: new Map(),
  }
  try {
    compile_function(state, null, null, ast.stmts, "<module>", [], null, {
      build: uses_import_meta(ast.stmts)
        ? (fn, scope) => init_import_meta(state, fn, scope, url)
        : undefined,
    })
  } catch (error) {
    if (!(error instanceof SyntaxError) || !(error as SourceDiagnostic).span)
      throw error
    throw located_error(path, source, [error])
  }
  for (const fn of unit.functions) {
    Object.freeze(fn.binding_flags)
    fn.block_binding_flags.forEach(Object.freeze)
    Object.freeze(fn.block_binding_flags)
    fn.parameters.forEach(Object.freeze)
    Object.freeze(fn.parameters)
    if (fn.rest) Object.freeze(fn.rest)
    fn.handlers.forEach(Object.freeze)
    Object.freeze(fn.handlers)
    Object.freeze(fn.source_offsets)
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
  unit.realm.forEach(Object.freeze)
  for (const template of unit.object_templates) {
    template.entries.forEach(Object.freeze)
    Object.freeze(template.entries)
    Object.freeze(template)
  }
  unit.array_holes.forEach(Object.freeze)
  for (const descriptor of unit.classes) {
    descriptor.members.forEach(Object.freeze)
    Object.freeze(descriptor.members)
    Object.freeze(descriptor)
  }
  for (const key of [
    "functions",
    "literals",
    "imports",
    "exports",
    "realm",
    "object_templates",
    "array_holes",
    "classes",
    "line_starts",
  ])
    Object.freeze(unit[key as keyof CompiledModule])
  return Object.freeze(unit)
}

const IMPORT_META = "*import.meta*"

class ImportMetaFinder extends ASTVisitorBase {
  found = false
  override visit_expr(expr: Expr) {
    if (expr.kind === "ImportMeta") this.found = true
    else super.visit_expr(expr)
  }
}

function uses_import_meta(stmts: readonly Stmt[]) {
  const finder = new ImportMetaFinder()
  for (const stmt of stmts) finder.visit_stmt(stmt)
  return finder.found
}

function init_import_meta(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  url: string,
) {
  const meta = create_object(
    state,
    fn,
    [{ key: literal(state, "url"), kind: PROPERTY_KIND.VALUE }],
    [constant(state, fn, url)],
  )
  emit(fn, OP.SET_PROTO, meta, constant(state, fn, null))
  init_binding(fn, declare_binding(scope, IMPORT_META, true), meta)
}

function line_starts(source: string) {
  const starts = [0]
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") starts.push(i + 1)
  return starts
}

function located_error(
  path: string,
  source: string,
  errors: readonly SourceDiagnostic[],
): SyntaxError {
  return new SyntaxError(located_message(path, source, errors))
}

export function located_message(
  path: string,
  source: string,
  errors: readonly SourceDiagnostic[],
) {
  return [...errors]
    .sort((a, b) => a.span!.start - b.span!.start)
    .map((error) => {
      const [line, col] = offset_to_line_and_col(source, error.span!.start)
      return `${path}:${line}:${col}: ${error.message}\n${preview_lines(source, error.span!, false)}`
    })
    .join("\n\n")
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
  fn.source_offsets.push(fn.source_offset)
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

/** Declares every name a binding pattern introduces. */
function declare_pattern(
  scope: Scope,
  pattern: Pattern,
  readonly: boolean,
): Binding[] {
  switch (pattern.kind) {
    case "Var":
      return [declare_local(scope, pattern.ident.text, readonly)]
    case "Assignment":
    case "Rest":
      return declare_pattern(scope, pattern.pattern, readonly)
    case "Array":
      return pattern.items.flatMap((item) =>
        declare_pattern(scope, item, readonly),
      )
    case "Object":
      return [
        ...pattern.properties.flatMap((property) =>
          declare_pattern(scope, property.value, readonly),
        ),
        ...(pattern.rest ? declare_pattern(scope, pattern.rest, readonly) : []),
      ]
    case "Elision":
      return []
    case "Prop":
      throw syntax_error(pattern, "Invalid destructuring target")
  }
}

/**
 * The binding that receives a parameter's argument. A destructured parameter
 * gets a hidden one, and its names are declared to be initialized later.
 */
function parameter_binding(scope: Scope, pattern: Pattern, index: number) {
  if (pattern.kind === "Var") return declare_pattern(scope, pattern, false)[0]
  declare_pattern(scope, pattern, false)
  return declare_local(scope, `*parameter ${index}*`)
}

/** Initializes the bindings `declare_pattern` declared in `scope`. */
function init_pattern(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  pattern: Pattern,
  value: number,
) {
  destructure(state, fn, scope, pattern, value, (target, item) => {
    if (target.kind !== "Var")
      throw syntax_error(target, "Invalid destructuring target")
    init_binding(fn, scope.bindings.get(target.ident.text)!, item)
  })
}

/**
 * Takes `value` apart as `pattern` describes, passing each leaf pattern (a
 * name or, in assignments, a property) and its value to `assign`.
 */
function destructure(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  pattern: Pattern,
  value: number,
  assign: (target: Pattern, value: number) => void,
) {
  switch (pattern.kind) {
    case "Assignment": {
      const result = allocate(fn)
      emit(fn, OP.MOVE, result, value)
      const skip = emit(fn, OP.JUMP_IF_NOT_UNDEFINED, result, 0)
      emit(
        fn,
        OP.MOVE,
        result,
        compile_expr(state, fn, scope, pattern.initializer),
      )
      fn.instructions[skip][2] = position(fn)
      destructure(state, fn, scope, pattern.pattern, result, assign)
      return
    }
    case "Object": {
      if (pattern.rest) unsupported(pattern.rest, "object rest")
      if (pattern.properties.length === 0) {
        // `{}` still requires an object-coercible value.
        const check = allocate(fn)
        emit(fn, OP.GET_PROP, check, value, constant(state, fn, "constructor"))
      }
      for (const property of pattern.properties) {
        const key = property_key(state, fn, scope, property.key)
        const item = allocate(fn)
        emit(fn, OP.GET_PROP, item, value, key)
        destructure(state, fn, scope, property.value, item, assign)
      }
      return
    }
    case "Array": {
      const iterator = allocate(fn)
      const next = allocate(fn)
      emit(fn, OP.GET_ITERATOR, iterator, next, value)
      const done = constant(state, fn, false)
      // Reads the next value, or undefined once the iterator is exhausted.
      const step = (item: number) => {
        emit(fn, OP.LOAD_CONST, item, literal(state, undefined))
        const skip = emit(fn, OP.JUMP_IF_TRUTHY, done, 0)
        const exhausted = emit(fn, OP.ITERATOR_NEXT, item, iterator, next, 0)
        const end = emit(fn, OP.JUMP, 0)
        fn.instructions[exhausted][4] = position(fn)
        emit(fn, OP.LOAD_CONST, done, literal(state, true))
        emit(fn, OP.LOAD_CONST, item, literal(state, undefined))
        fn.instructions[skip][2] = position(fn)
        fn.instructions[end][1] = position(fn)
      }
      for (const element of pattern.items) {
        if (element.kind === "Rest") {
          const rest = allocate(fn)
          emit(fn, OP.CREATE_ARRAY, rest, 0, 0, NO_HOLES)
          const index = constant(state, fn, 0)
          const one = constant(state, fn, 1)
          const key = allocate(fn)
          const skip = emit(fn, OP.JUMP_IF_TRUTHY, done, 0)
          const start = position(fn)
          const item = allocate(fn)
          const exhausted = emit(fn, OP.ITERATOR_NEXT, item, iterator, next, 0)
          emit(fn, OP.TO_PROPERTY_KEY, key, index)
          emit(fn, OP.DEFINE_PROP, rest, key, item, 7)
          emit(fn, OP.ADD, index, index, one)
          emit(fn, OP.JUMP, start)
          fn.instructions[exhausted][4] = position(fn)
          emit(fn, OP.LOAD_CONST, done, literal(state, true))
          fn.instructions[skip][2] = position(fn)
          destructure(state, fn, scope, element.pattern, rest, assign)
          continue
        }
        const item = allocate(fn)
        step(item)
        if (element.kind !== "Elision")
          destructure(state, fn, scope, element, item, assign)
      }
      const skip = emit(fn, OP.JUMP_IF_TRUTHY, done, 0)
      emit(fn, OP.ITERATOR_CLOSE, iterator, 0)
      fn.instructions[skip][2] = position(fn)
      return
    }
    default:
      assign(pattern, value)
  }
}

// Variables that no closure uses live in registers, except module-level ones,
// which imports, exports and the realm address by slot.
function declare_local(scope: Scope, name: string, readonly: boolean = false) {
  const fn = scope.owner
  const in_register =
    !(fn.parent === null && scope === fn.scope) &&
    !fn.captured.has(name) &&
    name !== "arguments"
  return declare_binding(
    scope,
    name,
    readonly,
    in_register ? allocate(fn) : null,
  )
}

/** Names that functions nested in a function's body refer to. */
class CaptureFinder extends ASTVisitorBase {
  depth = 0
  names = new Set<string>()
  override visit_expr(expr: Expr) {
    if (expr.kind === "Var" && this.depth) this.names.add(expr.ident.text)
    const nested = expr.kind === "ArrowFn"
    if (nested) this.depth++
    super.visit_expr(expr)
    if (nested) this.depth--
  }
  override visit_pattern(pattern: Pattern) {
    if (pattern.kind === "Var" && this.depth) this.names.add(pattern.ident.text)
    super.visit_pattern(pattern)
  }
  override visit_object_literal_entry(entry: ObjectLiteralEntry) {
    if (entry.kind === "Ident" && this.depth) this.names.add(entry.ident.text)
    super.visit_object_literal_entry(entry)
  }
  override visit_func(node: Func) {
    this.depth++
    super.visit_func(node)
    this.depth--
  }
  override visit_class(node: Class) {
    this.depth++
    super.visit_class(node)
    this.depth--
  }
}

function captured_names(
  params: readonly Param[],
  stmts: readonly Stmt[],
  expression_body: Expr | null,
) {
  const finder = new CaptureFinder()
  for (const param of params) finder.visit_param(param)
  for (const stmt of stmts) finder.visit_stmt(stmt)
  if (expression_body) finder.visit_expr(expression_body)
  return finder.names
}

function location(binding: Binding): BindingLocation {
  return binding.register === null
    ? { slot: binding.slot }
    : { register: binding.register }
}

function throw_error(
  state: CompilerState,
  fn: FunctionBuilder,
  type: string,
  message: string,
) {
  emit(fn, OP.THROW_ERROR, literal(state, type), literal(state, message))
}

const UNINITIALIZED_MESSAGE = "Cannot access binding before initialization"

function read_binding(
  state: CompilerState,
  fn: FunctionBuilder,
  binding: ResolvedBinding,
  dst: number,
) {
  if (binding.register === null)
    emit(fn, OP.LOAD_BINDING, dst, binding.depth, binding.slot)
  else if (!binding.initialized)
    throw_error(state, fn, "ReferenceError", UNINITIALIZED_MESSAGE)
  else emit(fn, OP.MOVE, dst, binding.register)
}

/** Runs a declaration in the binding's own scope. */
function init_binding(fn: FunctionBuilder, binding: Binding, value: number) {
  if (binding.register === null)
    emit(fn, OP.INIT_BINDING, 0, binding.slot, value)
  else emit(fn, OP.MOVE, binding.register, value)
  binding.initialized = true
}

function store_binding(
  state: CompilerState,
  fn: FunctionBuilder,
  binding: ResolvedBinding,
  value: number,
) {
  if (binding.register === null)
    emit(fn, OP.STORE_BINDING, binding.depth, binding.slot, value)
  else if (!binding.initialized)
    throw_error(state, fn, "ReferenceError", UNINITIALIZED_MESSAGE)
  else if (binding.readonly)
    throw_error(state, fn, "TypeError", "Assignment to constant binding")
  else emit(fn, OP.MOVE, binding.register, value)
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
          const bindings = declare_pattern(
            scope,
            item.pattern,
            stmt.decl.decl_type === "Const",
          )
          if (stmt.decl.is_exported) {
            if (fn.id !== 0 || scope !== fn.scope)
              unsupported(stmt, "nested export")
            for (const binding of bindings)
              export_binding(state, stmt, binding.name, binding.slot)
          }
        }
        if (
          fn.id === 0 &&
          marker_call(
            state,
            scope,
            stmt.decl.declarators[0]?.init,
            "well_known",
          )
        )
          declare_well_known(state, stmt, scope)
        break
      case "ClassDecl": {
        const name = stmt.class_def.name?.text
        if (!name) throw syntax_error(stmt, "A class declaration needs a name")
        const binding = declare_local(scope, name)
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
        const binding = declare_local(scope, stmt.func.name!.text)
        if (fn.id === 0 && scope === fn.scope) state.functions.add(binding.name)
        if (stmt.is_exported) {
          if (fn.id !== 0 || scope !== fn.scope)
            unsupported(stmt, "nested export")
          export_binding(state, stmt, binding.name, binding.slot)
        }
        break
      }
      case "Expr":
        if (
          fn.id === 0 &&
          (marker_call(state, scope, stmt.expr, "abstract_operation") ||
            marker_call(state, scope, stmt.expr, "internal_method"))
        )
          state.registrations.add(stmt)
        break
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
        if (stmt.is_type_only) break
        const bindings = []
        if (stmt.default_import) {
          bindings.push({
            imported: "default",
            slot: declare_binding(scope, stmt.default_import.text, true).slot,
            span: stmt.default_import.span,
          })
        }
        for (const item of stmt.named_imports) {
          if (item.type_only) continue
          const imported =
            item.imported_name.kind === "Ident"
              ? item.imported_name.ident.text
              : decode_string(item.imported_name.text, item)
          const local = item.as_name?.text ?? imported
          if (decode_string(stmt.module_specifier, stmt) === "djs:native")
            state.native_imports.set(local, imported)
          bindings.push({
            imported,
            slot: declare_binding(scope, local, true).slot,
            span: item.span,
          })
        }
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier, stmt),
          bindings,
          span: stmt.span,
        })
        break
      }
      case "ExportNamed": {
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested export")
        if (stmt.is_type_only) break
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
          bindings.push({
            imported: export_name(item, item.local_name),
            slot,
            span: item.span,
          })
          export_binding(state, item, exported, slot)
        }
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier, stmt),
          bindings,
          span: stmt.span,
        })
        break
      }
      case "ExportStar":
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested export")
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier, stmt),
          bindings: [],
          span: stmt.span,
          star_export: true,
        })
        break
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
  parameters: BindingLocation[]
  rest: BindingLocation | null
  arguments_slot: number | null
  binding_flags: boolean[]
  binding_count: number
  slot_count: number
  instructions: Instruction[]
  handlers: ExceptionHandler[]
  /** Where the code being compiled starts in the source. */
  source_offset: number
  source_offsets: number[]
  parent: FunctionBuilder | null
  scope: Scope | null
  flags: number
  /** Names that nested functions use; their bindings stay in environments. */
  captured: Set<string>
  block_environments: Environment[]
  /** Block indices of the environments pushed at the current compile position. */
  environment_blocks: number[]
  /** Number of block environments pushed at the current compile position. */
  environment_depth: number
  loops: Loop[]
  regions: Region[]
  /** Holds the value of a return that passes through regions. */
  return_register: number | null
  /** The hidden binding `super.x` reads x from, in a derived class's methods. */
  super_home?: string
  /** Initializes a derived class's fields; super() calls it. */
  initialize_fields?: () => void
}

interface Loop {
  /** A switch statement, which `break` exits but `continue` passes over. */
  is_switch?: boolean
  environment_depth: number
  /** The number of regions still enclosing the code after a break. */
  break_regions: number
  /** The number of regions still enclosing the code after a continue. */
  continue_regions: number
  breaks: number[]
  continues: number[]
}

type Exit = { kind: "return" } | { kind: "break" | "continue"; loop: Loop }

/**
 * A try statement with a finally block, or a for-of body. Returns, breaks and
 * continues that leave a region jump to a pad after it, which runs `cleanup`
 * and then continues the exit outward.
 */
interface Region {
  environment_depth: number
  cleanup: () => void
  exits: { exit: Exit; jumps: number[] }[]
}

export interface FunctionOptions {
  flags?: number
  build?: (fn: FunctionBuilder, scope: Scope) => void
  super_home?: string
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
    parameters: [],
    rest: null,
    arguments_slot: null,
    binding_flags: [],
    binding_count: 0,
    slot_count: 0,
    instructions: [],
    handlers: [],
    source_offset: parent?.source_offset ?? 0,
    source_offsets: [],
    parent,
    scope: null,
    flags: options.flags ?? 0,
    captured: captured_names(params, stmts, expression_body),
    block_environments: [],
    environment_blocks: [],
    environment_depth: 0,
    loops: [],
    regions: [],
    return_register: null,
    super_home: options.super_home,
  }
  state.unit.functions.push(null!)
  const scope = create_scope(parent_scope, fn)
  fn.scope = scope
  // Defaults and destructuring, applied in parameter order.
  const defaults: {
    binding: Binding
    initializer: Expr | null
    pattern: Pattern | null
  }[] = []
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
      const binding = parameter_binding(scope, pattern.pattern, index)
      binding.initialized = true
      fn.rest = location(binding)
      if (pattern.pattern.kind !== "Var")
        defaults.push({ binding, initializer: null, pattern: pattern.pattern })
      continue
    }
    const binding = parameter_binding(scope, pattern, index)
    binding.initialized = true
    fn.parameters.push(location(binding))
    if (initializer || pattern.kind !== "Var")
      defaults.push({
        binding,
        initializer: initializer ?? null,
        pattern: pattern.kind === "Var" ? null : pattern,
      })
  }
  if (options.build) options.build(fn, scope)
  for (const { binding, initializer, pattern } of defaults) {
    const resolved = { ...binding, depth: 0 }
    const value = allocate(fn)
    read_binding(state, fn, resolved, value)
    if (initializer) {
      const skip = emit(fn, OP.JUMP_IF_NOT_UNDEFINED, value, 0)
      emit(fn, OP.MOVE, value, compile_expr(state, fn, scope, initializer))
      store_binding(state, fn, resolved, value)
      fn.instructions[skip][2] = position(fn)
    }
    if (pattern) init_pattern(state, fn, scope, pattern, value)
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
    block_binding_flags: fn.block_environments.map(
      (environment) => environment.binding_flags,
    ),
    parameters: fn.parameters,
    rest: fn.rest,
    arguments_slot: fn.arguments_slot,
    slot_count: fn.slot_count,
    handlers: fn.handlers,
    source_offsets: fn.source_offsets,
    bytecode: encode_instructions(fn.instructions),
  }
  state.unit.functions[fn.id] = descriptor
  return fn.id
}

function function_id(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  func: Func,
  name: string,
  flags: number,
  super_home?: string,
) {
  if (func.is_generator) unsupported(func, "generator functions")
  return compile_function(
    state,
    fn,
    scope,
    func.body.stmts,
    name,
    func.params,
    null,
    { flags: func.is_async ? flags | 8 : flags, super_home },
  )
}

function function_value(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  func: Func,
  name: string = "",
  flags: number = 0,
  super_home?: string,
) {
  const dst = allocate(fn)
  emit(
    fn,
    OP.CREATE_CLOSURE,
    dst,
    function_id(state, fn, scope, func, name, flags, super_home),
  )
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
      init_binding(fn, scope.bindings.get(stmt.func.name!.text)!, value)
    }
  }
  for (const stmt of stmts) {
    if (
      stmt.kind !== "Func" &&
      stmt.kind !== "Import" &&
      stmt.kind !== "ExportNamed" &&
      stmt.kind !== "ExportStar"
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
  if (!("span" in stmt)) return compile_stmt_kind(state, fn, scope, stmt)
  compile_at(fn, stmt, () => compile_stmt_kind(state, fn, scope, stmt))
}

/** Attributes the instructions `compile` emits to `node`. */
function compile_at<T>(
  fn: FunctionBuilder,
  node: { span: Span },
  compile: () => T,
) {
  const outer = fn.source_offset
  fn.source_offset = node.span.start
  try {
    return compile()
  } finally {
    fn.source_offset = outer
  }
}

function compile_stmt_kind(
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
    case "Interface":
    case "Declare":
    case "TypeAlias":
      return
    case "Func":
      unsupported(stmt, "function declarations outside blocks")
      break
    case "Import":
      unsupported(stmt, "nested import")
      break
    case "Expr":
      if (state.registrations.has(stmt)) {
        declare_registration(state, scope, stmt.expr)
        return
      }
      compile_expr(state, fn, scope, stmt.expr)
      return
    case "VarDecl":
      if (state.well_known.has(stmt)) {
        fill_well_known(state, fn, scope, stmt)
        return
      }
      for (const item of stmt.decl.declarators) {
        const value = item.init
          ? compile_expr(state, fn, scope, item.init)
          : constant(state, fn, undefined)
        if (!item.init && stmt.decl.decl_type === "Const")
          throw syntax_error(stmt, "Missing const initializer")
        init_pattern(state, fn, scope, item.pattern, value)
      }
      return
    case "ClassDecl": {
      const value = class_value(state, fn, scope, stmt.class_def)
      init_binding(fn, scope.bindings.get(stmt.class_def.name!.text)!, value)
      return
    }
    case "Try": {
      const environment = current_environment(fn)
      const start = position(fn)
      const link = stmt.finally_block ? allocate(fn) : 0
      const finally_calls: number[] = []
      const call_finally = () =>
        finally_calls.push(emit(fn, OP.JUMP_AND_LINK, link, 0))
      let region: Region | null = null
      if (stmt.finally_block) {
        region = {
          environment_depth: fn.environment_depth,
          cleanup: call_finally,
          exits: [],
        }
        fn.regions.push(region)
      }
      const ends: number[] = []
      const complete_normally = () => {
        if (region) call_finally()
        ends.push(emit(fn, OP.JUMP, 0))
      }
      compile_stmt(state, fn, scope, { kind: "Block", block: stmt.try_block })
      const try_end = position(fn)
      complete_normally()
      if (stmt.catch_block) {
        const exception = allocate(fn)
        fn.handlers.push({
          start,
          end: try_end,
          target: position(fn),
          register: exception,
          environment,
        })
        const child = block_scope(fn, scope)
        if (stmt.catch_pattern)
          declare_pattern(child, stmt.catch_pattern, false)
        prepare_statements(state, fn, child, stmt.catch_block.stmts)
        const pushed = push_environment(fn, child)
        if (stmt.catch_pattern)
          init_pattern(state, fn, child, stmt.catch_pattern, exception)
        compile_statements(state, fn, child, stmt.catch_block.stmts)
        if (pushed) pop_environment(fn)
        complete_normally()
      }
      if (region) {
        const protected_end = position(fn)
        close_region(fn, region)
        const exception = allocate(fn)
        fn.handlers.push({
          start,
          end: protected_end,
          target: position(fn),
          register: exception,
          environment,
        })
        call_finally()
        emit(fn, OP.THROW, exception)
        for (const call of finally_calls)
          fn.instructions[call][2] = position(fn)
        compile_stmt(state, fn, scope, {
          kind: "Block",
          block: stmt.finally_block!,
        })
        emit(fn, OP.JUMP_INDIRECT, link)
      }
      for (const end of ends) fn.instructions[end][1] = position(fn)
      return
    }
    case "ExportDefault":
      init_binding(
        fn,
        scope.bindings.get("*default*")!,
        compile_expr(state, fn, scope, stmt.value),
      )
      return
    case "Return": {
      if (fn.id === 0)
        throw syntax_error(stmt, "Illegal return at module top level")
      const value = stmt.value
        ? compile_expr(state, fn, scope, stmt.value)
        : constant(state, fn, undefined)
      if (!fn.regions.length) {
        emit(fn, OP.RETURN, value)
        return
      }
      fn.return_register ??= allocate(fn)
      emit(fn, OP.MOVE, fn.return_register, value)
      emit_exit(fn, { kind: "return" })
      return
    }
    case "Switch": {
      const discriminant = compile_expr(state, fn, scope, stmt.condition)
      // All cases share one scope.
      const child = block_scope(fn, scope)
      const stmts = stmt.cases.flatMap((item) => item.body)
      prepare_statements(state, fn, child, stmts)
      const pushed = push_environment(fn, child)
      compile_statements(
        state,
        fn,
        child,
        stmts.filter((item) => item.kind === "Func"),
      )
      const loop = enter_loop(fn)
      loop.is_switch = true
      const matches = stmt.cases.map((item) => {
        if (!item.test) return null
        const test = compile_expr(state, fn, child, item.test)
        const equal = allocate(fn)
        emit(fn, OP.STRICT_EQ, equal, discriminant, test)
        return emit(fn, OP.JUMP_IF_TRUTHY, equal, 0)
      })
      const fallback = emit(fn, OP.JUMP, 0)
      let default_target = null
      for (const [index, item] of stmt.cases.entries()) {
        const match = matches[index]
        if (match === null) default_target = position(fn)
        else fn.instructions[match][2] = position(fn)
        for (const body_stmt of item.body)
          if (body_stmt.kind !== "Func")
            compile_stmt(state, fn, child, body_stmt)
      }
      fn.instructions[fallback][1] = default_target ?? position(fn)
      leave_loop(fn, loop, position(fn), 0)
      if (pushed) pop_environment(fn)
      return
    }
    case "Block": {
      const child = block_scope(fn, scope)
      prepare_statements(state, fn, child, stmt.block.stmts)
      const pushed = push_environment(fn, child)
      compile_statements(state, fn, child, stmt.block.stmts)
      if (pushed) pop_environment(fn)
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
      const loop = enter_loop(fn)
      const start = position(fn)
      const condition = compile_expr(state, fn, scope, stmt.condition)
      const end = emit(fn, OP.JUMP_IF_FALSY, condition, 0)
      compile_stmt(state, fn, scope, stmt.body)
      emit(fn, OP.JUMP, start)
      fn.instructions[end][2] = position(fn)
      leave_loop(fn, loop, position(fn), start)
      return
    }
    case "For": {
      // Lexical declarations get a loop environment. For let, each iteration
      // copies it so closures capture that iteration's bindings.
      const child = create_scope(
        scope,
        fn,
        stmt.init.kind === "VarDecl" ? { binding_flags: [] } : undefined,
      )
      let pushed = false
      if (stmt.init.kind === "VarDecl") {
        const decl = new VarDeclStmt(stmt.span, stmt.init.decl)
        prepare_statements(state, fn, child, [decl])
        pushed = push_environment(fn, child)
        compile_stmt(state, fn, child, decl)
      } else compile_expr(state, fn, scope, stmt.init.expr)
      const per_iteration =
        pushed &&
        stmt.init.kind === "VarDecl" &&
        stmt.init.decl.decl_type === "Let"
      const copy_environment = () => {
        if (per_iteration)
          emit(
            fn,
            OP.COPY_ENV,
            fn.block_environments.indexOf(child.environment),
          )
      }
      copy_environment()
      const loop = enter_loop(fn)
      const start = position(fn)
      const exit = stmt.test
        ? emit(
            fn,
            OP.JUMP_IF_FALSY,
            compile_expr(state, fn, child, stmt.test),
            0,
          )
        : null
      compile_stmt(state, fn, child, stmt.body)
      const next = position(fn)
      copy_environment()
      if (stmt.update) compile_expr(state, fn, child, stmt.update)
      emit(fn, OP.JUMP, start)
      if (exit !== null) fn.instructions[exit][2] = position(fn)
      leave_loop(fn, loop, position(fn), next)
      if (pushed) pop_environment(fn)
      return
    }
    case "ForInOrOf": {
      if (stmt.decl_type === "Var") unsupported(stmt, "var declarations")
      const is_of = stmt.in_or_of === "Of"
      const readonly = stmt.decl_type === "Const"
      let iterable
      if (stmt.decl_type) {
        // The right-hand side sees the loop bindings in their TDZ.
        const tdz = create_scope(scope, fn, { binding_flags: [] })
        declare_pattern(tdz, stmt.lhs, readonly)
        const pushed = push_environment(fn, tdz)
        iterable = compile_expr(state, fn, tdz, stmt.rhs)
        if (pushed) pop_environment(fn)
      } else iterable = compile_expr(state, fn, scope, stmt.rhs)
      const iterator = allocate(fn)
      const next = allocate(fn)
      emit(
        fn,
        is_of ? OP.GET_ITERATOR : OP.GET_FOR_IN_ITERATOR,
        iterator,
        next,
        iterable,
      )
      // For-of closes the iterator when the body exits abruptly. Errors from
      // the iterator itself, raised by ITERATOR_NEXT, do not close it.
      const environment = current_environment(fn)
      let region: Region | null = null
      if (is_of) {
        region = {
          environment_depth: fn.environment_depth,
          cleanup: () => emit(fn, OP.ITERATOR_CLOSE, iterator, 0),
          exits: [],
        }
        fn.regions.push(region)
      }
      const loop = enter_loop(fn)
      if (region) loop.break_regions--
      const start = position(fn)
      const value = allocate(fn)
      const exit = emit(fn, OP.ITERATOR_NEXT, value, iterator, next, 0)
      const body_start = position(fn)
      const child = create_scope(
        scope,
        fn,
        stmt.decl_type ? { binding_flags: [] } : undefined,
      )
      let pushed = false
      if (stmt.decl_type) {
        declare_pattern(child, stmt.lhs, readonly)
        pushed = push_environment(fn, child)
        init_pattern(state, fn, child, stmt.lhs, value)
      } else store_pattern(state, fn, scope, stmt.lhs, value)
      compile_stmt(state, fn, child, stmt.body)
      if (pushed) pop_environment(fn)
      emit(fn, OP.JUMP, start)
      if (region) {
        const body_end = position(fn)
        close_region(fn, region)
        const exception = allocate(fn)
        fn.handlers.push({
          start: body_start,
          end: body_end,
          target: position(fn),
          register: exception,
          environment,
        })
        emit(fn, OP.ITERATOR_CLOSE, iterator, 1)
        emit(fn, OP.THROW, exception)
      }
      fn.instructions[exit][4] = position(fn)
      leave_loop(fn, loop, position(fn), start)
      return
    }
    case "Break":
    case "Continue": {
      if (stmt.label) unsupported(stmt, `labeled ${stmt.kind.toLowerCase()}`)
      let index = fn.loops.length - 1
      if (stmt.kind === "Continue")
        while (index >= 0 && fn.loops[index].is_switch) index--
      const loop = fn.loops[index]
      if (!loop)
        throw syntax_error(stmt, `Illegal ${stmt.kind.toLowerCase()} statement`)
      emit_exit(fn, {
        kind: stmt.kind === "Break" ? "break" : "continue",
        loop,
      })
      return
    }
    default:
      unsupported(stmt)
  }
}

// Stores an already evaluated value, unlike Assign which evaluates the target
// before the value.
function store_pattern(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  pattern: Pattern,
  value: number,
) {
  if (pattern.kind === "Var") {
    const binding = resolve_name(scope, pattern.ident.text)
    if (!binding)
      throw syntax_error(
        pattern,
        `Assignment to undeclared binding: ${pattern.ident.text}`,
      )
    store_binding(state, fn, binding, value)
    return
  }
  if (pattern.kind === "Prop") {
    const object = compile_expr(state, fn, scope, pattern.expr)
    const is_private = pattern.key.kind === "Private"
    const key = is_private
      ? private_name(state, fn, scope, pattern.key.ident)
      : property_key(state, fn, scope, pattern.key)
    emit(fn, is_private ? OP.SET_PRIVATE : OP.SET_PROP, object, key, value)
    return
  }
  destructure(state, fn, scope, pattern, value, (target, item) =>
    store_pattern(state, fn, scope, target, item),
  )
}

// Inside loops, a block's bindings get a fresh environment on each entry so
// closures from different iterations do not share them.
function block_scope(fn: FunctionBuilder, parent: Scope) {
  return create_scope(
    parent,
    fn,
    fn.loops.length ? { binding_flags: [] } : undefined,
  )
}

function push_environment(fn: FunctionBuilder, scope: Scope) {
  const parent = scope.parent!.environment
  if (scope.environment === parent) return false
  if (!scope.environment.binding_flags.length) {
    scope.environment = parent
    return false
  }
  const block = fn.block_environments.push(scope.environment) - 1
  emit(fn, OP.PUSH_ENV, block)
  fn.environment_blocks.push(block)
  fn.environment_depth++
  return true
}

function pop_environment(fn: FunctionBuilder) {
  emit(fn, OP.POP_ENV, 1)
  fn.environment_blocks.pop()
  fn.environment_depth--
}

function current_environment(fn: FunctionBuilder) {
  return fn.environment_blocks.at(-1) ?? FUNCTION_ENVIRONMENT
}

function enter_loop(fn: FunctionBuilder): Loop {
  const loop = {
    environment_depth: fn.environment_depth,
    break_regions: fn.regions.length,
    continue_regions: fn.regions.length,
    breaks: [],
    continues: [],
  }
  fn.loops.push(loop)
  return loop
}

function leave_loop(
  fn: FunctionBuilder,
  loop: Loop,
  break_target: number,
  continue_target: number,
) {
  fn.loops.pop()
  for (const jump of loop.breaks) fn.instructions[jump][1] = break_target
  for (const jump of loop.continues) fn.instructions[jump][1] = continue_target
}

// Leaves the environments the exit's destination is outside of, without
// changing the compile position's depth: code after the exit still runs there.
function pop_environments(fn: FunctionBuilder, depth: number) {
  if (fn.environment_depth > depth)
    emit(fn, OP.POP_ENV, fn.environment_depth - depth)
}

function emit_exit(fn: FunctionBuilder, exit: Exit) {
  const remaining =
    exit.kind === "return"
      ? 0
      : exit.kind === "break"
        ? exit.loop.break_regions
        : exit.loop.continue_regions
  if (fn.regions.length > remaining) {
    const region = fn.regions.at(-1)!
    pop_environments(fn, region.environment_depth)
    let pending = region.exits.find(
      (item) =>
        item.exit.kind === exit.kind &&
        (exit.kind === "return" ||
          (item.exit as { loop: Loop }).loop === exit.loop),
    )
    if (!pending) region.exits.push((pending = { exit, jumps: [] }))
    pending.jumps.push(emit(fn, OP.JUMP, 0))
    return
  }
  if (exit.kind === "return") {
    emit(fn, OP.RETURN, fn.return_register!)
    return
  }
  pop_environments(fn, exit.loop.environment_depth)
  const jumps = exit.kind === "break" ? exit.loop.breaks : exit.loop.continues
  jumps.push(emit(fn, OP.JUMP, 0))
}

// Pads follow the region, outside its exception handlers, and continue each
// exit from the region's environment depth.
function close_region(fn: FunctionBuilder, region: Region) {
  fn.regions.pop()
  if (!region.exits.length) return
  const skip = emit(fn, OP.JUMP, 0)
  const depth = fn.environment_depth
  fn.environment_depth = region.environment_depth
  for (const { exit, jumps } of region.exits) {
    for (const jump of jumps) fn.instructions[jump][1] = position(fn)
    region.cleanup()
    emit_exit(fn, exit)
  }
  fn.environment_depth = depth
  fn.instructions[skip][1] = position(fn)
}

const binary_operators: Record<string, number> = {
  In: OP.IN,
  Add: OP.ADD,
  Sub: OP.SUB,
  Mul: OP.MUL,
  Div: OP.DIV,
  Mod: OP.MOD,
  Exponent: OP.EXP,
  BitXor: OP.BIT_XOR,
  BitAnd: OP.BIT_AND,
  BitOr: OP.BIT_OR,
  Gt: OP.GT,
  Lt: OP.LT,
  Gte: OP.GT_EQ,
  Lte: OP.LT_EQ,
  EqEq: OP.EQ,
  EqEqEq: OP.STRICT_EQ,
  NotEq: OP.NOT_EQ,
  NotEqEq: OP.STRICT_NOT_EQ,
  LeftShift: OP.SHL,
  RightShift: OP.SHR,
  UnsignedRightShift: OP.USHR,
  Instanceof: OP.INSTANCEOF,
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
  if (binding) read_binding(state, fn, binding, dst)
  else
    emit(fn, OP.LOAD_GLOBAL, dst, literal(state, name), allow_missing ? 1 : 0)
  return dst
}

/** The property name of a non-computed key. */
function static_key(key: ObjectKey): string | null {
  if (key.kind === "Ident") return key.ident.text
  if (key.kind === "String") {
    // The parser uses String keys for both quoted and numeric property names.
    const text = key.text
    return text[0] === '"' || text[0] === "'"
      ? decode_string(text, key)
      : String(Number(text.replaceAll("_", "")))
  }
  return null
}

function property_key(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  key: ObjectKey,
) {
  const name = static_key(key)
  if (name !== null) return constant(state, fn, name)
  if (key.kind === "Computed") {
    const value = compile_expr(state, fn, scope, key.expr)
    const name = allocate(fn)
    emit(fn, OP.TO_PROPERTY_KEY, name, value)
    return name
  }
  unsupported(key)
}

function property_kind(accessor?: import("djs_ast").AccessorType | null) {
  return accessor === "Get"
    ? PROPERTY_KIND.GETTER
    : accessor === "Set"
      ? PROPERTY_KIND.SETTER
      : PROPERTY_KIND.VALUE
}

function accessor_prefix(kind: PropertyKind) {
  return kind === PROPERTY_KIND.GETTER
    ? "get"
    : kind === PROPERTY_KIND.SETTER
      ? "set"
      : ""
}

/** The name of a method under a static key; computed keys name it at runtime. */
function method_name(name: string | null, kind: PropertyKind) {
  if (name === null) return ""
  const prefix = accessor_prefix(kind)
  return prefix ? `${prefix} ${name}` : name
}

/** A method closure for an object literal or a well-known object. */
function method_value(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  method: import("djs_ast").MethodDef,
  key: number,
) {
  const name = static_key(method.name)
  const kind = property_kind(method.accessor_type)
  const value = function_value(
    state,
    fn,
    scope,
    method.body,
    method_name(name, kind),
    2,
  )
  if (name === null)
    emit(
      fn,
      OP.SET_FUNCTION_NAME,
      value,
      key,
      literal(state, accessor_prefix(kind)),
    )
  return value
}

function template_id(
  state: CompilerState,
  table: unknown[],
  kind: string,
  value: unknown,
) {
  const json = kind + JSON.stringify(value)
  let id = state.template_ids.get(json)
  if (id === undefined) {
    id = table.push(value) - 1
    state.template_ids.set(json, id)
  }
  return id
}

/** `values` holds each entry's operands in the order CREATE_OBJECT takes them. */
function create_object(
  state: CompilerState,
  fn: FunctionBuilder,
  entries: ObjectTemplate["entries"],
  values: number[],
) {
  const first = allocate(fn, values.length)
  for (let i = 0; i < values.length; i++)
    emit(fn, OP.MOVE, first + i, values[i])
  const dst = allocate(fn)
  emit(
    fn,
    OP.CREATE_OBJECT,
    dst,
    template_id(state, state.unit.object_templates, "object", { entries }),
    first,
  )
  return dst
}

/**
 * An optional chain: `a?.b.c()` is one chain, and a nullish `a` skips the
 * rest of it. `exits` are the JUMPs taken on a nullish `?.` operand, patched
 * by `end_chain` once the outermost member is compiled.
 */
interface Chain {
  exits: number[]
}

function compile_chain(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: PropExpr | IndexExpr | CallExpr,
) {
  const chain: Chain = { exits: [] }
  return end_chain(
    state,
    fn,
    chain,
    chain_member(state, fn, scope, expr, chain),
  )
}

function end_chain(
  state: CompilerState,
  fn: FunctionBuilder,
  chain: Chain,
  value: number,
  nullish_value: Literal = undefined,
) {
  if (chain.exits.length === 0) return value
  const dst = allocate(fn)
  emit(fn, OP.MOVE, dst, value)
  const end = emit(fn, OP.JUMP, 0)
  for (const exit of chain.exits) fn.instructions[exit][1] = position(fn)
  emit(fn, OP.LOAD_CONST, dst, literal(state, nullish_value))
  fn.instructions[end][1] = position(fn)
  return dst
}

function exit_chain_if_nullish(
  fn: FunctionBuilder,
  chain: Chain,
  value: number,
) {
  const skip = emit(fn, OP.JUMP_IF_NOT_NULLISH, value, 0)
  chain.exits.push(emit(fn, OP.JUMP, 0))
  fn.instructions[skip][2] = position(fn)
}

/** Compiles `expr` as part of `chain` unless parentheses end the chain. */
function chain_operand(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: Expr,
  chain: Chain,
) {
  while (expr.kind === "NonNull" || expr.kind === "TypeApplication")
    expr = expr.expr
  return expr.kind === "Prop" || expr.kind === "Index" || expr.kind === "Call"
    ? chain_member(state, fn, scope, expr, chain)
    : compile_expr(state, fn, scope, expr)
}

function chain_member(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: PropExpr | IndexExpr | CallExpr,
  chain: Chain,
): number {
  return compile_at(fn, expr, () => {
    if (expr.kind === "Call") return compile_call(state, fn, scope, expr, chain)
    const reference = property_reference(state, fn, scope, expr, chain)
    const dst = allocate(fn)
    emit(
      fn,
      reference.private ? OP.GET_PRIVATE : OP.GET_PROP,
      dst,
      reference.object,
      reference.key,
    )
    return dst
  })
}

function compile_call(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: CallExpr,
  chain: Chain,
) {
  let callee, receiver
  let target = expr.callee
  let parenthesized = false
  while (
    target.kind === "Paren" ||
    target.kind === "NonNull" ||
    target.kind === "TypeApplication"
  ) {
    if (target.kind === "Paren") parenthesized = true
    target = target.expr
  }
  const super_call = target.kind === "Super"
  const construct = target.kind === "New" || super_call
  if (super_call) {
    if (!(fn.flags & FUNCTION_DERIVED))
      throw syntax_error(
        expr,
        "super() is only valid in a derived class constructor",
      )
    callee = load_name(state, fn, scope, SUPER_CONSTRUCTOR)
    receiver = allocate(fn)
    emit(fn, OP.LOAD_NEW_TARGET, receiver)
  } else if (target.kind === "New") {
    callee = compile_expr(
      state,
      fn,
      scope,
      (target as Extract<Expr, { kind: "New" }>).expr,
    )
    receiver = constant(state, fn, undefined)
  } else if (target.kind === "Prop" || target.kind === "Index") {
    // `(a?.b)()` keeps `a` as the receiver but ends the chain at the parens.
    const callee_chain = parenthesized ? { exits: [] } : chain
    const reference = property_reference(state, fn, scope, target, callee_chain)
    // super.method() reads the method from the home object but calls it on this.
    receiver =
      target.lhs.kind === "Super"
        ? load_name(state, fn, scope, "this")
        : reference.object
    callee = allocate(fn)
    emit(
      fn,
      reference.private ? OP.GET_PRIVATE : OP.GET_PROP,
      callee,
      reference.object,
      reference.key,
    )
    if (parenthesized) callee = end_chain(state, fn, callee_chain, callee)
  } else if (
    target.kind === "Var" &&
    SLOT_OPERATIONS.includes(native_import(state, scope, target.ident.text)!)
  ) {
    const name = expr.args[1]
    if (name?.kind !== "String")
      throw syntax_error(expr, "Slot names must be string literals")
    const slot_name = decode_string(name.text, name)
    if (!state.unit.slot_names.includes(slot_name))
      state.unit.slot_names.push(slot_name)
    callee = load_name(state, fn, scope, target.ident.text)
    receiver = constant(state, fn, undefined)
  } else {
    callee = chain_operand(state, fn, scope, expr.callee, chain)
    receiver = constant(state, fn, undefined)
  }
  if (expr.is_optional) exit_chain_if_nullish(fn, chain, callee)
  const args = allocate(fn, expr.args.length + (expr.spread ? 1 : 0))
  for (let i = 0; i < expr.args.length; i++) {
    emit(fn, OP.MOVE, args + i, compile_expr(state, fn, scope, expr.args[i]))
  }
  if (expr.spread)
    emit(
      fn,
      OP.MOVE,
      args + expr.args.length,
      compile_expr(state, fn, scope, expr.spread),
    )
  const dst = allocate(fn)
  emit(
    fn,
    expr.spread
      ? construct
        ? OP.CONSTRUCT_SPREAD
        : OP.CALL_SPREAD
      : construct
        ? OP.CONSTRUCT
        : OP.CALL,
    dst,
    callee,
    receiver,
    args,
    expr.args.length,
  )
  if (super_call) {
    emit(fn, OP.BIND_THIS, dst)
    fn.initialize_fields?.()
  }
  return dst
}

/**
 * An array literal with spread elements. Their lengths are only known at run
 * time, so each element is defined at a running index.
 */
function compile_spread_array(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  items: readonly ArrayLiteralMember[],
) {
  const array = allocate(fn)
  emit(fn, OP.CREATE_ARRAY, array, 0, 0, NO_HOLES)
  const index = constant(state, fn, 0)
  const one = constant(state, fn, 1)
  const key = allocate(fn)
  const append = (value: number) => {
    emit(fn, OP.TO_PROPERTY_KEY, key, index)
    emit(fn, OP.DEFINE_PROP, array, key, value, 7)
    emit(fn, OP.ADD, index, index, one)
  }
  for (const item of items) {
    if (item.kind === "Elision") {
      emit(fn, OP.ADD, index, index, one)
    } else if (item.kind === "Expr") {
      append(compile_expr(state, fn, scope, item.expr))
    } else {
      const iterable = compile_expr(state, fn, scope, item.expr)
      const iterator = allocate(fn)
      const next = allocate(fn)
      emit(fn, OP.GET_ITERATOR, iterator, next, iterable)
      const start = position(fn)
      const value = allocate(fn)
      const exit = emit(fn, OP.ITERATOR_NEXT, value, iterator, next, 0)
      append(value)
      emit(fn, OP.JUMP, start)
      fn.instructions[exit][4] = position(fn)
    }
  }
  // Trailing elisions still count toward the length.
  emit(fn, OP.SET_PROP, array, constant(state, fn, "length"), index)
  return array
}

/** Reads and writes the binding an assignment or update expression targets. */
function binding_target(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  ident: Ident,
) {
  const binding = resolve_name(scope, ident.text)
  if (!binding)
    throw syntax_error(ident, `Assignment to undeclared binding: ${ident.text}`)
  return {
    read: () => load_name(state, fn, scope, ident.text),
    write: (value: number) => store_binding(state, fn, binding, value),
  }
}

/** Reads and writes a property whose object and key are already evaluated. */
function property_target(
  fn: FunctionBuilder,
  object: number,
  key: number,
  is_private: boolean,
) {
  return {
    read: () => {
      const dst = allocate(fn)
      emit(fn, is_private ? OP.GET_PRIVATE : OP.GET_PROP, dst, object, key)
      return dst
    },
    write: (value: number) => {
      emit(fn, is_private ? OP.SET_PRIVATE : OP.SET_PROP, object, key, value)
    },
  }
}

function property_reference(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: PropExpr | IndexExpr,
  chain: Chain,
) {
  const object = chain_operand(state, fn, scope, expr.lhs, chain)
  if (expr.is_optional) exit_chain_if_nullish(fn, chain, object)
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
  return compile_at(fn, expr, () => compile_expr_kind(state, fn, scope, expr))
}

function compile_expr_kind(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  expr: Expr,
): number {
  switch (expr.kind) {
    case "String":
      return constant(state, fn, decode_string(expr.text, expr))
    case "Regex": {
      const end = expr.text.lastIndexOf("/")
      const pattern = constant(state, fn, expr.text.slice(1, end))
      const flags = constant(state, fn, expr.text.slice(end + 1))
      const dst = allocate(fn)
      emit(fn, OP.CREATE_REGEXP, dst, pattern, flags)
      return dst
    }
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
        if (fragment.kind !== "Text") {
          const text = allocate(fn)
          emit(fn, OP.TO_STRING, text, value)
          value = text
        }
        if (result === undefined) {
          result = value
        } else {
          const dst = allocate(fn)
          emit(fn, OP.ADD, dst, result, value)
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
      if (
        NATIVE_MARKERS.includes(native_import(state, scope, expr.ident.text)!)
      )
        throw syntax_error(
          expr,
          `${expr.ident.text} declares the realm and is never evaluated`,
        )
      if (
        SLOT_OPERATIONS.includes(native_import(state, scope, expr.ident.text)!)
      )
        throw syntax_error(
          expr,
          `${expr.ident.text} can only be called directly`,
        )
      return load_name(state, fn, scope, expr.ident.text)
    case "Paren":
    case "NonNull":
    case "TypeApplication":
    case "As":
      return compile_expr(state, fn, scope, expr.expr)
    case "Prop":
    case "Index":
    case "Call":
      return compile_chain(state, fn, scope, expr)
    case "Array": {
      if (expr.items.some((item) => item.kind === "Spread"))
        return compile_spread_array(state, fn, scope, expr.items)
      const first = allocate(fn, expr.items.length)
      const holes = []
      for (let index = 0; index < expr.items.length; index++) {
        const item = expr.items[index]
        if (item.kind === "Elision") {
          holes.push(index)
          continue
        }
        emit(
          fn,
          OP.MOVE,
          first + index,
          compile_expr(state, fn, scope, item.expr),
        )
      }
      const dst = allocate(fn)
      emit(
        fn,
        OP.CREATE_ARRAY,
        dst,
        first,
        expr.items.length,
        holes.length
          ? template_id(state, state.unit.array_holes, "holes", holes)
          : NO_HOLES,
      )
      return dst
    }
    case "ImportMeta":
      return load_name(state, fn, scope, IMPORT_META)
    case "Super": {
      let owner: FunctionBuilder | null = fn
      while (owner && owner.flags & 4) owner = owner.parent
      if (!owner?.super_home)
        throw syntax_error(expr, "'super' keyword unexpected here")
      return load_name(state, fn, scope, owner.super_home)
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
        const chain: Chain = { exits: [] }
        const reference = property_reference(state, fn, scope, target, chain)
        if (reference.private)
          throw syntax_error(expr, "Cannot delete a private field")
        emit(fn, OP.DELETE_PROP, dst, reference.object, reference.key)
        return end_chain(state, fn, chain, dst, true)
      } else {
        if (target.kind === "Var")
          throw syntax_error(expr, "Cannot delete a binding in strict mode")
        compile_expr(state, fn, scope, target)
        emit(fn, OP.LOAD_CONST, dst, literal(state, true))
      }
      return dst
    }
    case "Object": {
      const entries: ObjectTemplate["entries"] = []
      const values = []
      // Entries after a spread are defined one by one, after the copy.
      let object: number | null = null
      for (const entry of expr.entries) {
        if (entry.kind === "Spread") {
          object ??= create_object(state, fn, entries, values)
          const source = compile_expr(state, fn, scope, entry.expr)
          emit(fn, OP.COPY_DATA_PROPERTIES, object, source)
          continue
        }
        let name: string | null, key, value
        let kind: PropertyKind = PROPERTY_KIND.VALUE
        if (entry.kind === "Ident") {
          name = entry.ident.text
          value = load_name(state, fn, scope, entry.ident.text)
        } else if (entry.kind === "Prop") {
          name = static_key(entry.key)
          if (name === null) key = property_key(state, fn, scope, entry.key)
          value = compile_expr(state, fn, scope, entry.value)
        } else if (entry.kind === "Method") {
          name = static_key(entry.method.name)
          if (name === null)
            key = property_key(state, fn, scope, entry.method.name)
          kind = property_kind(entry.method.accessor_type)
          value = method_value(state, fn, scope, entry.method, key!)
        } else unsupported(entry)
        if (object !== null) {
          emit(
            fn,
            OP.DEFINE_PROP,
            object,
            key ?? constant(state, fn, name!),
            value,
            WRITABLE | ENUMERABLE | CONFIGURABLE,
            kind,
          )
          continue
        }
        entries.push({ key: name === null ? null : literal(state, name), kind })
        if (key !== undefined) values.push(key)
        values.push(value)
      }
      return object ?? create_object(state, fn, entries, values)
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
      const short_circuit = {
        And: OP.JUMP_IF_FALSY,
        Or: OP.JUMP_IF_TRUTHY,
        Coalesce: OP.JUMP_IF_NOT_NULLISH,
      }[expr.operator as string]
      if (short_circuit !== undefined) {
        const dst = allocate(fn)
        emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.lhs))
        const end = emit(fn, short_circuit, dst, 0)
        emit(fn, OP.MOVE, dst, compile_expr(state, fn, scope, expr.rhs))
        fn.instructions[end][2] = position(fn)
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
      const opcode = binary_operators[expr.operator]
      if (opcode === undefined) unsupported(expr, `binary ${expr.operator}`)
      const left = compile_expr(state, fn, scope, expr.lhs)
      const right = compile_expr(state, fn, scope, expr.rhs)
      const dst = allocate(fn)
      emit(fn, opcode, dst, left, right)
      return dst
    }
    case "Assign": {
      const pattern = expr.pattern
      if (
        (pattern.kind === "Object" || pattern.kind === "Array") &&
        expr.operator === "Eq"
      ) {
        const value = compile_expr(state, fn, scope, expr.value)
        store_pattern(state, fn, scope, pattern, value)
        return value
      }
      let read, write
      if (pattern.kind === "Var") {
        ;({ read, write } = binding_target(state, fn, scope, pattern.ident))
      } else if (pattern.kind === "Prop") {
        const object = compile_expr(state, fn, scope, pattern.expr)
        const is_private = pattern.key.kind === "Private"
        const key = is_private
          ? private_name(state, fn, scope, pattern.key.ident)
          : property_key(state, fn, scope, pattern.key)
        ;({ read, write } = property_target(fn, object, key, is_private))
      } else {
        unsupported(pattern, "assignment destructuring")
      }
      if (expr.operator === "Eq") {
        const value = compile_expr(state, fn, scope, expr.value)
        write(value)
        return value
      }
      const short_circuit = {
        AndEq: OP.JUMP_IF_FALSY,
        OrEq: OP.JUMP_IF_TRUTHY,
        NullishEq: OP.JUMP_IF_NOT_NULLISH,
      }[expr.operator as string]
      if (short_circuit !== undefined) {
        const dst = allocate(fn)
        emit(fn, OP.MOVE, dst, read())
        const end = emit(fn, short_circuit, dst, 0)
        const value = compile_expr(state, fn, scope, expr.value)
        write(value)
        emit(fn, OP.MOVE, dst, value)
        fn.instructions[end][2] = position(fn)
        return dst
      }
      // Each compound operator is its binary operator's name plus "Eq".
      const opcode = binary_operators[expr.operator.slice(0, -"Eq".length)]
      const current = read()
      const value = compile_expr(state, fn, scope, expr.value)
      const dst = allocate(fn)
      emit(fn, opcode, dst, current, value)
      write(dst)
      return dst
    }
    case "PreIncrement":
    case "PreDecrement":
    case "PostIncrement":
    case "PostDecrement": {
      let target = expr.value
      while (target.kind === "Paren") target = target.expr
      let read, write
      if (target.kind === "Var") {
        ;({ read, write } = binding_target(state, fn, scope, target.ident))
      } else if (
        (target.kind === "Prop" || target.kind === "Index") &&
        !target.is_optional
      ) {
        const reference = property_reference(state, fn, scope, target, {
          exits: [],
        })
        ;({ read, write } = property_target(
          fn,
          reference.object,
          reference.key,
          reference.private,
        ))
      } else {
        throw syntax_error(target, "Invalid update expression target")
      }
      const old_value = allocate(fn)
      emit(fn, OP.TO_NUMBER, old_value, read())
      const new_value = allocate(fn)
      emit(
        fn,
        expr.kind.endsWith("Increment") ? OP.ADD : OP.SUB,
        new_value,
        old_value,
        constant(state, fn, 1),
      )
      write(new_value)
      return expr.kind.startsWith("Post") ? old_value : new_value
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
      let operand = expr.expr
      while (operand.kind === "Paren") operand = operand.expr
      const value =
        expr.kind === "TypeOf" && operand.kind === "Var"
          ? load_name(state, fn, scope, operand.ident.text, true)
          : compile_expr(state, fn, scope, expr.expr)
      if (expr.kind === "Void") return constant(state, fn, undefined)
      const dst = allocate(fn)
      const opcode = {
        Not: OP.NOT,
        BitNot: OP.BIT_NOT,
        UnaryPlus: OP.TO_NUMBER,
        UnaryMinus: OP.NEGATE,
        TypeOf: OP.TYPEOF,
      }[expr.kind]
      emit(fn, opcode, dst, value)
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

// The class body is a block whose environment holds the class's inner name,
// private names and computed keys, for its methods to capture.
function class_value(
  state: CompilerState,
  fn: FunctionBuilder,
  parent_scope: Scope,
  cls: ClassDefinition,
): number {
  if (cls.decorators.length)
    throw syntax_error(cls, "Decorators are not supported")
  for (const item of cls.body.members) {
    const member = (item.method ?? item.field)!
    if (member.decorators.length)
      throw syntax_error(member, "Decorators are not supported")
  }
  const scope = create_scope(parent_scope, fn, { binding_flags: [] })
  const class_binding = declare_binding(
    scope,
    cls.name?.text ?? "*class*",
    true,
  )
  const pushed = push_environment(fn, scope)
  const derived = cls.superclass !== null
  let superclass: number | null = null
  let super_prototype: number | null = null
  if (cls.superclass) {
    superclass = compile_expr(state, fn, scope, cls.superclass)
    super_prototype = allocate(fn)
    emit(
      fn,
      OP.GET_PROP,
      super_prototype,
      superclass,
      constant(state, fn, "prototype"),
    )
    init_binding(
      fn,
      declare_binding(scope, SUPER_CONSTRUCTOR, true),
      superclass,
    )
    init_binding(
      fn,
      declare_binding(scope, SUPER_PROTOTYPE, true),
      super_prototype,
    )
  }
  const home = (is_static: boolean) =>
    derived ? (is_static ? SUPER_CONSTRUCTOR : SUPER_PROTOTYPE) : undefined
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
      throw syntax_error(member, `Duplicate or invalid private name: ${name}`)
    if (member.accessor_type) unsupported(member, "private accessors")
    const hidden = `*private:${name}*`
    scope.private_names.set(name, hidden)
    init_binding(
      fn,
      declare_binding(scope, hidden, true),
      create_object(state, fn, [], []),
    )
  }
  const keys = new Map<ClassElement, string>()
  const key_registers = new Map<ClassElement, number>()
  const private_methods = new Map<ClassElement, Binding>()
  for (let i = 0; i < members.length; i++) {
    const member = members[i]
    if (member.name.kind === "Computed") {
      const hidden = `*key:${i}*`
      const key = property_key(state, fn, scope, member.name)
      init_binding(fn, declare_binding(scope, hidden, true), key)
      keys.set(member, hidden)
      key_registers.set(member, key)
    }
    if (member.body && member.name.kind === "Private")
      private_methods.set(member, declare_binding(scope, `*method:${i}*`, true))
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
  // A derived class without a constructor gets constructor(...args) { super(...args) }.
  const args = { span: cls.span, text: "args" }
  const default_params: Param[] = derived
    ? [
        {
          span: cls.span,
          pattern: Pattern.Rest(cls.span, Pattern.Var(cls.span, args)),
          is_optional: false,
          type_annotation: null,
          initializer: null,
        },
      ]
    : []
  const default_body = derived
    ? [
        Stmt.Expr(
          cls.span,
          Expr.Call(
            cls.span,
            Expr.Super(cls.span),
            [],
            Expr.Var(cls.span, "", args),
            false,
          ),
        ),
      ]
    : []
  const initialize_fields = (owner: FunctionBuilder) => {
    const field_scope = create_scope(scope, owner)
    const receiver = load_name(state, owner, field_scope, "this")
    for (const [member, binding] of private_methods)
      if (!member.is_static)
        emit(
          owner,
          OP.INIT_PRIVATE,
          receiver,
          key_of(owner, field_scope, member),
          load_name(state, owner, field_scope, binding.name),
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
        member.name.kind === "Private" ? OP.INIT_PRIVATE : OP.DEFINE_PROP,
        receiver,
        key,
        value,
        member.name.kind === "Private" ? 0 : 7,
      )
    }
  }
  const constructor_function = compile_function(
    state,
    fn,
    scope,
    constructor?.body!.body.stmts ?? default_body,
    cls.name?.text ?? "",
    constructor?.body!.params ?? default_params,
    null,
    {
      flags: derived ? 1 | FUNCTION_DERIVED : 1,
      super_home: home(false),
      build(owner: FunctionBuilder) {
        if (!derived) return initialize_fields(owner)
        const depth = owner.environment_depth
        owner.initialize_fields = () => {
          if (owner.environment_depth !== depth)
            unsupported(cls, "super() inside a block with captured bindings")
          initialize_fields(owner)
        }
      },
    },
  )
  const descriptor: ClassDescriptor = {
    constructor_function,
    members: [],
  }
  const computed_keys = []
  for (const member of members) {
    if (
      !member.body ||
      member === constructor ||
      member.name.kind === "Private"
    )
      continue
    const name = static_key(member.name)
    const kind = property_kind(member.accessor_type)
    descriptor.members.push({
      function: function_id(
        state,
        fn,
        scope,
        member.body,
        method_name(name, kind),
        2,
        home(member.is_static),
      ),
      key: name === null ? null : literal(state, name),
      kind,
      is_static: member.is_static,
    })
    if (name === null) computed_keys.push(key_registers.get(member)!)
  }
  const first = allocate(fn, computed_keys.length)
  for (let i = 0; i < computed_keys.length; i++)
    emit(fn, OP.MOVE, first + i, computed_keys[i])
  const ctor = allocate(fn)
  emit(
    fn,
    OP.CREATE_CLASS,
    ctor,
    state.unit.classes.push(descriptor) - 1,
    first,
  )
  if (superclass !== null) {
    emit(fn, OP.SET_PROTO, ctor, superclass)
    const prototype = allocate(fn)
    emit(fn, OP.GET_PROP, prototype, ctor, constant(state, fn, "prototype"))
    emit(fn, OP.SET_PROTO, prototype, super_prototype!)
  }
  init_binding(fn, class_binding, ctor)
  for (const [member, binding] of private_methods) {
    const value = function_value(
      state,
      fn,
      scope,
      member.body!,
      member.name.ident!.text,
      2,
      home(member.is_static),
    )
    init_binding(fn, binding, value)
    if (member.is_static)
      emit(fn, OP.INIT_PRIVATE, ctor, key_of(fn, scope, member), value, 1)
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
        { flags: 2, super_home: home(true) },
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
  if (pushed) pop_environment(fn)
  return ctor
}

const SLOT_OPERATIONS = ["has_slot", "get_slot", "set_slot"]

// Hidden class-scope bindings of a derived class: its superclass and the
// superclass's prototype, which super() and super.x read.
const SUPER_CONSTRUCTOR = "*super*"
const SUPER_PROTOTYPE = "*super prototype*"

/** The djs:native export a module-level name imports, if any. */
function native_import(state: CompilerState, scope: Scope, name: string) {
  const binding = resolve_binding(scope, name)
  if (!binding || binding.owner.id !== 0) return undefined
  return state.native_imports.get(name)
}

/** The arguments of `name(...)` when `expr` calls that djs:native marker. */
function marker_call(
  state: CompilerState,
  scope: Scope,
  expr: Expr | null | undefined,
  name: string,
) {
  if (expr?.kind !== "Call" || expr.callee.kind !== "Var") return null
  if (native_import(state, scope, expr.callee.ident.text) !== name) return null
  if (expr.spread || expr.is_optional)
    throw syntax_error(expr, `Invalid ${name}(...) marker`)
  return expr.args
}

function string_args(node: Expr, args: readonly Expr[], count: number) {
  if (args.length !== count)
    throw syntax_error(node, "Wrong number of marker arguments")
  return args.map((arg) => {
    if (arg.kind !== "String")
      throw syntax_error(arg, "Marker arguments must be string literals")
    return decode_string(arg.text, arg)
  })
}

function steps_entry(
  state: CompilerState,
  scope: Scope,
  entry: ObjectLiteralEntry,
) {
  return (
    entry.kind === "Prop" &&
    entry.key.kind === "Computed" &&
    marker_call(state, scope, entry.key.expr, "internal_method") !== null
  )
}

// The native operation a well-known object is allocated with, named after the
// spec's creation algorithm, and the kind of object it creates.
const CREATION_OPERATIONS = Object.freeze({
  ordinary_object_create: "ordinary",
  array_create: "array",
  string_create: "string",
  create_builtin_function: "function",
} as const)

// const X = well_known("%X%", creation_operation, { … })
function declare_well_known(
  state: CompilerState,
  stmt: VarDeclStmt,
  scope: Scope,
) {
  const [item] = stmt.decl.declarators
  const init = item.init!
  if (
    stmt.decl.decl_type !== "Const" ||
    stmt.decl.declarators.length !== 1 ||
    item.pattern.kind !== "Var"
  )
    throw syntax_error(stmt, "Expected const name = well_known(...)")
  const args = marker_call(state, scope, init, "well_known")!
  if (args.length !== 3)
    throw syntax_error(init, 'Expected well_known("%X%", create, { … })')
  const [name] = string_args(init, args.slice(0, 1), 1)
  const [, create, literal] = args
  const operation =
    create.kind === "Var"
      ? native_import(state, scope, create.ident.text)
      : undefined
  if (!operation || !Object.hasOwn(CREATION_OPERATIONS, operation))
    throw syntax_error(
      create,
      `Expected one of ${Object.keys(CREATION_OPERATIONS).join(", ")} from djs:native`,
    )
  const object =
    CREATION_OPERATIONS[operation as keyof typeof CREATION_OPERATIONS]
  if (literal.kind !== "Object")
    throw syntax_error(literal, "Expected an object literal")
  const has_steps = literal.entries.some((entry) =>
    steps_entry(state, scope, entry),
  )
  if (has_steps !== (object === "function"))
    throw syntax_error(
      literal,
      has_steps
        ? "Only create_builtin_function objects have [[Call]] steps"
        : "create_builtin_function requires an internal_method member",
    )
  state.unit.realm.push({
    kind: "well_known",
    name,
    slot: scope.bindings.get(item.pattern.ident.text)!.slot,
    object,
  })
  state.well_known.set(stmt, literal)
}

// abstract_operation("Name", fn) and internal_method(kind, "[[X]]", fn)
function declare_registration(state: CompilerState, scope: Scope, expr: Expr) {
  const call = expr as Extract<Expr, { kind: "Call" }>
  const kind = native_import(state, scope, (call.callee as VarExpr).ident.text)
  const target = call.args.at(-1)
  const binding =
    target?.kind === "Var" ? scope.bindings.get(target.ident.text) : undefined
  if (!binding || !state.functions.has(binding.name))
    throw syntax_error(expr, "Expected a function declared in this module")
  if (kind === "abstract_operation") {
    const [name] = string_args(expr, call.args.slice(0, -1), 1)
    state.unit.realm.push({ kind, name, slot: binding.slot })
  } else {
    const [object, method] = string_args(expr, call.args.slice(0, -1), 2)
    if (object !== "array" || method !== "[[DefineOwnProperty]]")
      throw syntax_error(
        expr,
        `Unsupported internal method: ${object} ${method}`,
      )
    state.unit.realm.push({
      kind: "internal_method",
      object,
      method,
      slot: binding.slot,
    })
  }
}

function fill_well_known(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  stmt: VarDeclStmt,
) {
  const pattern = stmt.decl.declarators[0].pattern as Extract<
    Pattern,
    { kind: "Var" }
  >
  // The VM allocated the object before evaluation; this fills it.
  const object = load_name(state, fn, scope, pattern.ident.text)
  for (const entry of state.well_known.get(stmt)!.entries)
    fill_entry(state, fn, scope, object, entry)
}

function fill_entry(
  state: CompilerState,
  fn: FunctionBuilder,
  scope: Scope,
  object: number,
  entry: ObjectLiteralEntry,
): void {
  if (entry.kind === "Spread")
    unsupported(entry, "spread in a well-known object")
  if (entry.kind === "Prop" && entry.key.kind === "Computed") {
    const slot = marker_call(state, scope, entry.key.expr, "slot")
    if (slot) {
      const [name] = string_args(entry.key.expr, slot, 1)
      const value = compile_expr(state, fn, scope, entry.value)
      emit(fn, OP.INIT_SLOT, object, literal(state, name), value)
      return
    }
    const steps = marker_call(state, scope, entry.key.expr, "internal_method")
    if (steps) {
      const marker = entry.key.expr
      const names = steps.map(
        (_, index) => string_args(marker, steps.slice(index, index + 1), 1)[0],
      )
      if (
        names[0] !== "[[Call]]" ||
        names.length > 2 ||
        (names.length === 2 && names[1] !== "[[Construct]]")
      )
        throw syntax_error(
          marker,
          'Expected internal_method("[[Call]]"[, "[[Construct]]"])',
        )
      if (entry.value.kind !== "Func")
        throw syntax_error(entry.value, "Expected a function expression")
      const name = entry.value.func.name?.text ?? ""
      const id = function_id(state, fn, scope, entry.value.func, name, 2)
      const value = allocate(fn)
      emit(fn, OP.CREATE_CLOSURE, value, id)
      emit(fn, OP.SET_BEHAVIOR, object, value, names.length === 2 ? 1 : 0)
      for (const [property, initial] of [
        ["length", state.unit.functions[id].length],
        ["name", name],
      ] as const)
        emit(
          fn,
          OP.DEFINE_PROP,
          object,
          constant(state, fn, property),
          constant(state, fn, initial),
          4,
        )
      return
    }
  }
  const accessor = entry.kind === "Method" ? entry.method.accessor_type : null
  let flags = accessor ? 4 : 5
  let key, value
  if (entry.kind === "Ident") {
    key = constant(state, fn, entry.ident.text)
    value = load_name(state, fn, scope, entry.ident.text)
  } else if (entry.kind === "Prop") {
    key = property_key(state, fn, scope, entry.key)
    let initializer = entry.value
    const attributes = marker_call(state, scope, initializer, "attributes")
    if (attributes) {
      if (attributes.length !== 2)
        throw syntax_error(initializer, "Expected attributes({ … }, value)")
      flags = attribute_flags(attributes[0], flags)
      initializer = attributes[1]
    }
    value = compile_expr(state, fn, scope, initializer)
  } else {
    key = property_key(state, fn, scope, entry.method.name)
    value = method_value(state, fn, scope, entry.method, key)
  }
  emit(fn, OP.DEFINE_PROP, object, key, value, flags, property_kind(accessor))
}

// Built-in properties default to non-enumerable (ECMA-262 clause 18).
function attribute_flags(node: Expr, flags: number) {
  if (node.kind !== "Object")
    throw syntax_error(node, "Expected an object literal of attributes")
  const masks = { writable: 1, enumerable: 2, configurable: 4 }
  for (const entry of node.entries) {
    if (
      entry.kind !== "Prop" ||
      entry.key.kind !== "Ident" ||
      !Object.hasOwn(masks, entry.key.ident.text) ||
      entry.value.kind !== "Boolean"
    )
      throw syntax_error(entry, "Expected writable, enumerable or configurable")
    const mask = masks[entry.key.ident.text as keyof typeof masks]
    flags = entry.value.value ? flags | mask : flags & ~mask
  }
  return flags
}
