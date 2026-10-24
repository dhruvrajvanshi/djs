import { QualifiedName } from "djs_ast"
import { parse_source_file } from "djs_parser"
import { OP, INSTRUCTION_BYTES, encode_instructions } from "./bytecode.js"
import { create_scope, declare_binding, resolve_binding } from "./scopes.js"

// Decode source literals without running source on the host.
export function decode_string(text) {
  const quote = text[0]
  if ((quote !== '"' && quote !== "'") || text.at(-1) !== quote) {
    throw new SyntaxError("Invalid string literal")
  }
  let result = ""
  for (let i = 1; i < text.length - 1; i++) {
    const char = text[i]
    if (char !== "\\") {
      result += char
      continue
    }
    const escape = text[++i]
    const simple = {
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
        throw new SyntaxError("Legacy octal escape")
      result += simple[escape]
    } else if (escape === "\n" || escape === "\u2028" || escape === "\u2029") {
      continue
    } else if (escape === "\r") {
      if (text[i + 1] === "\n") i++
    } else if (escape === "x" || escape === "u") {
      let digits
      if (escape === "u" && text[i + 1] === "{") {
        const end = text.indexOf("}", i + 2)
        if (end === -1) throw new SyntaxError("Invalid Unicode escape")
        digits = text.slice(i + 2, end)
        i = end
      } else {
        const count = escape === "x" ? 2 : 4
        digits = text.slice(i + 1, i + count + 1)
        if (digits.length !== count)
          throw new SyntaxError("Invalid string escape")
        i += count
      }
      if (
        !/^[0-9a-f]+$/i.test(digits) ||
        Number.parseInt(digits, 16) > 0x10ffff
      ) {
        throw new SyntaxError("Invalid Unicode escape")
      }
      result += String.fromCodePoint(Number.parseInt(digits, 16))
    } else {
      if (/[1-9]/.test(escape)) throw new SyntaxError("Legacy numeric escape")
      result += escape
    }
  }
  return result
}

export function compile_module(
  source,
  path = "<module>",
  { allow_intrinsics = false } = {},
) {
  const ast = parse_source_file(QualifiedName(), path, source)
  if (ast.errors.length) {
    throw new SyntaxError(
      `${path}: ${ast.errors.map((error) => error.message).join("; ")}`,
    )
  }
  const unit = {
    path,
    functions: [],
    literals: [],
    imports: [],
    exports: [],
    entry: 0,
  }
  const state = { unit, allow_intrinsics, prepared: new WeakSet() }
  compile_function(state, null, null, ast.stmts, "<module>", [])
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
    Object.freeze(unit[key])
  return Object.freeze(unit)
}

function unsupported(node, description = node.kind) {
  throw new SyntaxError(`Unsupported syntax: ${description}`)
}

function literal(state, value) {
  const found = state.unit.literals.findIndex((item) => Object.is(item, value))
  if (found !== -1) return found
  return state.unit.literals.push(value) - 1
}

function allocate(fn, count = 1) {
  const slot = fn.slot_count
  fn.slot_count += count
  return slot
}

function emit(fn, opcode, ...operands) {
  const index = fn.instructions.length
  fn.instructions.push([opcode, ...operands])
  return index
}

function position(fn) {
  return fn.instructions.length * INSTRUCTION_BYTES
}

function constant(state, fn, value) {
  const dst = allocate(fn)
  emit(fn, OP.CONST, dst, literal(state, value))
  return dst
}

function declare_pattern(scope, pattern, readonly) {
  if (pattern.kind !== "Var") unsupported(pattern, "binding destructuring")
  return declare_binding(scope, pattern.ident.text, readonly)
}

function export_binding(state, name, slot) {
  if (state.unit.exports.some((item) => item.name === name))
    throw new SyntaxError(`Duplicate export: ${name}`)
  state.unit.exports.push({ name, slot })
}

function prepare_statements(state, fn, scope, stmts) {
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
            export_binding(state, binding.name, binding.slot)
          }
        }
        break
      case "Func": {
        if (!stmt.func.name)
          throw new SyntaxError("A function declaration needs a name")
        const binding = declare_binding(scope, stmt.func.name.text)
        if (stmt.is_exported) {
          if (fn.id !== 0 || scope !== fn.scope)
            unsupported(stmt, "nested export")
          export_binding(state, binding.name, binding.slot)
        }
        break
      }
      case "ExportDefault": {
        if (fn.id !== 0 || scope !== fn.scope)
          unsupported(stmt, "nested export")
        const binding = declare_binding(scope, "*default*", true)
        export_binding(state, "default", binding.slot)
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
              : decode_string(item.imported_name.text)
          const local = item.as_name?.text ?? imported
          bindings.push({
            imported,
            slot: declare_binding(scope, local, true).slot,
          })
        }
        state.unit.imports.push({
          specifier: decode_string(stmt.module_specifier),
          bindings,
        })
        break
      }
    }
  }
}

function compile_function(
  state,
  parent,
  parent_scope,
  stmts,
  name,
  params,
  expression_body = null,
) {
  const fn = {
    id: state.unit.functions.length,
    name,
    params: params.length,
    parameter_slots: [],
    binding_flags: [],
    binding_count: 0,
    slot_count: 0,
    instructions: [],
    parent,
    scope: null,
  }
  state.unit.functions.push(null)
  const scope = create_scope(parent_scope, fn)
  fn.scope = scope
  for (const param of params) {
    if (param.initializer) unsupported(param, "default parameters")
    fn.parameter_slots.push(declare_pattern(scope, param.pattern, false).slot)
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
    binding_count: fn.binding_flags.length,
    binding_flags: fn.binding_flags,
    parameter_slots: fn.parameter_slots,
    slot_count: fn.slot_count,
    bytecode: encode_instructions(fn.instructions),
  }
  state.unit.functions[fn.id] = descriptor
  return fn.id
}

function function_value(state, fn, scope, func, name = "<anonymous>") {
  if (func.is_async || func.is_generator)
    unsupported(func, "async/generator functions")
  const id = compile_function(
    state,
    fn,
    scope,
    func.body.stmts,
    name,
    func.params,
  )
  const dst = allocate(fn)
  emit(fn, OP.CLOSURE, dst, id)
  return dst
}

function compile_statements(state, fn, scope, stmts) {
  // Declarations initialize before statements, allowing calls before declaration.
  for (const stmt of stmts) {
    if (stmt.kind === "Func") {
      const value = function_value(
        state,
        fn,
        scope,
        stmt.func,
        stmt.func.name.text,
      )
      emit(
        fn,
        OP.INIT_ENV,
        0,
        scope.bindings.get(stmt.func.name.text).slot,
        value,
      )
    }
  }
  for (const stmt of stmts) {
    if (stmt.kind !== "Func" && stmt.kind !== "Import")
      compile_stmt(state, fn, scope, stmt)
  }
}

function compile_stmt(state, fn, scope, stmt) {
  if (
    ["VarDecl", "ExportDefault"].includes(stmt.kind) &&
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
          throw new SyntaxError("Missing const initializer")
        emit(
          fn,
          OP.INIT_ENV,
          0,
          scope.bindings.get(item.pattern.ident.text).slot,
          value,
        )
      }
      return
    case "ExportDefault":
      emit(
        fn,
        OP.INIT_ENV,
        0,
        scope.bindings.get("*default*").slot,
        compile_expr(state, fn, scope, stmt.value),
      )
      return
    case "Return":
      if (fn.id === 0)
        throw new SyntaxError("Illegal return at module top level")
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
      const branch = emit(fn, OP.JUMP_IF_FALSE, condition, 0)
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
      const end = emit(fn, OP.JUMP_IF_FALSE, condition, 0)
      compile_stmt(state, fn, scope, stmt.body)
      emit(fn, OP.JUMP, start)
      fn.instructions[end][2] = position(fn)
      return
    }
    default:
      unsupported(stmt)
  }
}

function contains_declaration(stmt) {
  if (["VarDecl", "Func"].includes(stmt.kind)) return true
  if (stmt.kind === "Block") return stmt.block.stmts.some(contains_declaration)
  if (stmt.kind === "If")
    return (
      contains_declaration(stmt.if_true) ||
      (stmt.if_false && contains_declaration(stmt.if_false))
    )
  if (stmt.kind === "While") return contains_declaration(stmt.body)
  return false
}

const binary_operators = {
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
}

function load_name(state, fn, scope, name, allow_missing = false) {
  const dst = allocate(fn)
  if (name === "this") {
    emit(fn, OP.LOAD_THIS, dst)
    return dst
  }
  const binding = resolve_binding(scope, name)
  if (binding) emit(fn, OP.LOAD_ENV, dst, binding.depth, binding.slot)
  else
    emit(fn, OP.LOAD_GLOBAL, dst, literal(state, name), allow_missing ? 1 : 0)
  return dst
}

function property_key(state, fn, scope, key) {
  if (key.kind === "Ident") return constant(state, fn, key.ident.text)
  if (key.kind === "String") return constant(state, fn, decode_string(key.text))
  if (key.kind === "Computed") return compile_expr(state, fn, scope, key.expr)
  unsupported(key)
}

function property_reference(state, fn, scope, expr) {
  if (expr.is_optional) unsupported(expr, "optional chaining")
  const object = compile_expr(state, fn, scope, expr.lhs)
  const key =
    expr.kind === "Prop"
      ? constant(state, fn, expr.property.text)
      : compile_expr(state, fn, scope, expr.property)
  return { object, key }
}

function compile_expr(state, fn, scope, expr) {
  switch (expr.kind) {
    case "String":
      return constant(state, fn, decode_string(expr.text))
    case "Number": {
      if (expr.text.endsWith("n")) unsupported(expr, "bigint literals")
      const value = Number(expr.text.replaceAll("_", ""))
      if (Number.isNaN(value)) throw new SyntaxError("Invalid number literal")
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
      const { object, key } = property_reference(state, fn, scope, expr)
      const dst = allocate(fn)
      emit(fn, OP.GET_PROP, dst, object, key)
      return dst
    }
    case "Call": {
      if (expr.is_optional || expr.spread)
        unsupported(expr, "optional/spread calls")
      let callee, receiver
      let target = expr.callee
      while (target.kind === "Paren") target = target.expr
      if (target.kind === "Prop" || target.kind === "Index") {
        const reference = property_reference(state, fn, scope, target)
        receiver = reference.object
        callee = allocate(fn)
        emit(fn, OP.GET_PROP, callee, receiver, reference.key)
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
      emit(fn, OP.CALL, dst, callee, receiver, args, expr.args.length)
      return dst
    }
    case "Object": {
      const dst = allocate(fn)
      emit(fn, OP.OBJECT, dst)
      for (const entry of expr.entries) {
        let key, value
        if (entry.kind === "Ident") {
          key = constant(state, fn, entry.ident.text)
          value = load_name(state, fn, scope, entry.ident.text)
        } else if (entry.kind === "Prop") {
          key = property_key(state, fn, scope, entry.key)
          value = compile_expr(state, fn, scope, entry.value)
        } else if (entry.kind === "Method") {
          if (entry.method.accessor_type) unsupported(entry, "accessors")
          key = property_key(state, fn, scope, entry.method.name)
          value = function_value(state, fn, scope, entry.method.body)
        } else unsupported(entry)
        emit(fn, OP.SET_PROP, dst, key, value)
      }
      return dst
    }
    case "Func":
      if (expr.func.name) unsupported(expr, "named function expressions")
      return function_value(state, fn, scope, expr.func)
    case "ArrowFn":
      unsupported(expr, "arrow functions")
      break
    case "DJSIntrinsic": {
      if (!state.allow_intrinsics)
        throw new SyntaxError(
          "@djs_intrinsic is restricted to trusted builtin modules",
        )
      const dst = allocate(fn)
      emit(fn, OP.INTRINSIC, dst, literal(state, expr.name))
      return dst
    }
    case "Await": {
      if (fn.id !== 0) unsupported(expr, "await inside an ordinary function")
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
      const operator = binary_operators[expr.operator]
      if (!operator) unsupported(expr, `binary ${expr.operator}`)
      const left = compile_expr(state, fn, scope, expr.lhs)
      const right = compile_expr(state, fn, scope, expr.rhs)
      const dst = allocate(fn)
      emit(fn, OP.BINARY, dst, left, right, literal(state, operator))
      return dst
    }
    case "Assign": {
      if (expr.operator !== "Eq") unsupported(expr, "compound assignment")
      const pattern = expr.pattern
      if (pattern.kind === "Var") {
        const binding = resolve_binding(scope, pattern.ident.text)
        if (!binding)
          throw new SyntaxError(
            `Assignment to undeclared binding: ${pattern.ident.text}`,
          )
        const value = compile_expr(state, fn, scope, expr.value)
        emit(fn, OP.STORE_ENV, binding.depth, binding.slot, value)
        return value
      }
      if (pattern.kind === "Prop") {
        const object = compile_expr(state, fn, scope, pattern.expr)
        const key = property_key(state, fn, scope, pattern.key)
        const value = compile_expr(state, fn, scope, expr.value)
        emit(fn, OP.SET_PROP, object, key, value)
        return value
      }
      unsupported(pattern, "assignment destructuring")
      break
    }
    case "Ternary": {
      const dst = allocate(fn)
      const condition = compile_expr(state, fn, scope, expr.condition)
      const branch = emit(fn, OP.JUMP_IF_FALSE, condition, 0)
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
      return value
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
      emit(fn, OP.UNARY, dst, value, literal(state, operator))
      return dst
    }
    default:
      unsupported(expr)
  }
}
