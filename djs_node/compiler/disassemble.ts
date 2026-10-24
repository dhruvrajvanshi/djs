import type { Literal, CompiledModule } from "./compile.ts"
import { OP, INSTRUCTION_BYTES, decode_instruction } from "./bytecode.ts"
import { record_invert } from "../utils.ts"

// Operand order matches the fixed-width words read by the interpreter.
const OPERANDS: Record<string, string[]> = {
  LOAD_CONST: ["dst", "literal"],
  MOVE: ["dst", "src"],
  LOAD_BINDING: ["dst", "depth", "binding"],
  INIT_BINDING: ["depth", "binding", "src"],
  STORE_BINDING: ["depth", "binding", "src"],
  LOAD_GLOBAL: ["dst", "literal", "allow_missing"],
  GET_PROP: ["dst", "object", "key"],
  SET_PROP: ["object", "key", "src"],
  CREATE_OBJECT: ["dst"],
  CREATE_CLOSURE: ["dst", "function"],
  CALL: ["dst", "callee", "this", "args", "argc"],
  RETURN: ["src"],
  AWAIT: ["dst", "src"],
  THROW: ["src"],
  JUMP: ["target"],
  JUMP_IF_FALSY: ["condition", "target"],
  BINARY_OP: ["dst", "left", "right", "literal"],
  UNARY_OP: ["dst", "src", "literal"],
  LOAD_THIS: ["dst"],
  CONSTRUCT: ["dst", "callee", "unused", "args", "argc"],
  DEFINE_PROP: ["object", "key", "src", "flags", "setter"],
  SET_PROTO: ["object", "prototype"],
  INIT_PRIVATE: ["object", "key", "src", "readonly"],
  GET_PRIVATE: ["dst", "object", "key"],
  SET_PRIVATE: ["object", "key", "src", "readonly"],
  HAS_PRIVATE: ["dst", "object", "key"],
  TRY: ["catch", "finally", "end", "exception"],
  LEAVE_TRY: [],
  END_FINALLY: [],
  CREATE_ARRAY: ["dst", "length"],
  DELETE_PROP: ["dst", "object", "key"],
  LOAD_NEW_TARGET: ["dst"],
  INIT_BUILTIN_CLASS: ["constructor", "prototype", "kind"],
  INSTALL_INTERNAL_METHOD: ["constructor", "method", "hook"],
  REGISTER_BUILTIN: ["constructor", "prototype", "name"],
  TO_PROPERTY_KEY: ["dst", "src"],
}

const OPCODE_NAMES = record_invert(OP)

function format_literal(value: Literal): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (Object.is(value, -0)) return "-0"
  return String(value)
}

export function disassemble_module(unit: CompiledModule): string {
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
      const name = OPCODE_NAMES[opcode]
      const words = [a, b, c, d, e]
      const operands = OPERANDS[name!].map(
        (label, index) => `${label}=${words[index]}`,
      )
      lines.push(
        `  ${pc}: ${name}${operands.length ? " " + operands.join(" ") : ""}`,
      )
    }
  }
  return lines.join("\n") + "\n\n"
}
