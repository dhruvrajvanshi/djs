import { OP, INSTRUCTION_BYTES, decode_instruction } from "./bytecode.js"

// Operand order matches the fixed-width words read by the interpreter.
const OPERANDS = {
  CONST: ["dst", "literal"],
  MOVE: ["dst", "src"],
  LOAD_ENV: ["dst", "depth", "binding"],
  INIT_ENV: ["depth", "binding", "src"],
  STORE_ENV: ["depth", "binding", "src"],
  LOAD_GLOBAL: ["dst", "literal", "allow_missing"],
  GET_PROP: ["dst", "object", "key"],
  SET_PROP: ["object", "key", "src"],
  OBJECT: ["dst"],
  CLOSURE: ["dst", "function"],
  CALL: ["dst", "callee", "this", "args", "argc"],
  RETURN: ["src"],
  AWAIT: ["dst", "src"],
  THROW: ["src"],
  JUMP: ["target"],
  JUMP_IF_FALSE: ["condition", "target"],
  BINARY: ["dst", "left", "right", "literal"],
  UNARY: ["dst", "src", "literal"],
  LOAD_THIS: ["dst"],
  CONSTRUCT: ["dst", "callee", "unused", "args", "argc"],
  DEFINE_PROP: ["object", "key", "src", "flags", "setter"],
  SET_PROTO: ["object", "prototype"],
  PRIVATE_INIT: ["object", "key", "src", "readonly"],
  PRIVATE_GET: ["dst", "object", "key"],
  PRIVATE_SET: ["object", "key", "src", "readonly"],
  PRIVATE_HAS: ["dst", "object", "key"],
  TRY: ["catch", "finally", "end", "exception"],
  LEAVE_TRY: [],
  END_FINALLY: [],
}
const OPCODE_NAMES = new Map(
  Object.entries(OP).map(([name, opcode]) => [opcode, name]),
)

function format_literal(value) {
  if (typeof value === "string") return JSON.stringify(value)
  if (Object.is(value, -0)) return "-0"
  return String(value)
}

export function disassemble_module(unit) {
  const lines = [`Module ${JSON.stringify(unit.path)}`, "Literals:"]
  for (const [index, value] of unit.literals.entries())
    lines.push(`  ${index}: ${format_literal(value)}`)
  for (const fn of unit.functions) {
    lines.push(
      "",
      `Function ${fn.id} ${JSON.stringify(fn.name)} (params=${fn.params}, slots=${fn.slot_count}, bindings=${fn.binding_count}):`,
    )
    const bytes = fn.bytecode
    for (let pc = 0; pc < bytes.length; pc += INSTRUCTION_BYTES) {
      const { opcode, a, b, c, d, e } = decode_instruction(bytes, pc)
      const name = OPCODE_NAMES.get(opcode)
      const words = [a, b, c, d, e]
      const operands = OPERANDS[name].map(
        (label, index) => `${label}=${words[index]}`,
      )
      lines.push(
        `  ${pc}: ${name}${operands.length ? " " + operands.join(" ") : ""}`,
      )
    }
  }
  return lines.join("\n") + "\n\n"
}
