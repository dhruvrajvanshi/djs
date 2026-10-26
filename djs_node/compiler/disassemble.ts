import type { Literal, CompiledModule } from "./compile.ts"
import { OP, INSTRUCTION_BYTES, decode_instruction } from "./bytecode.ts"
import { record_invert } from "../utils.ts"

// Operand order matches the fixed-width words read by the interpreter.
const OPERANDS: Record<string, string[]> = {
  LOAD_CONST: ["dst", "literal"],
  MOVE: ["dst", "src"],
  LOAD_THIS: ["dst"],
  LOAD_NEW_TARGET: ["dst"],
  LOAD_GLOBAL: ["dst", "literal", "allow_missing"],
  LOAD_BINDING: ["dst", "depth", "binding"],
  INIT_BINDING: ["depth", "binding", "src"],
  STORE_BINDING: ["depth", "binding", "src"],
  PUSH_ENV: ["environment"],
  POP_ENV: ["count"],
  COPY_ENV: ["environment"],
  CREATE_OBJECT: ["dst", "template", "first"],
  CREATE_ARRAY: ["dst", "first", "length", "holes"],
  CREATE_CLOSURE: ["dst", "function"],
  CREATE_CLASS: ["dst", "class", "first"],
  SET_FUNCTION_NAME: ["function", "key", "literal"],
  GET_PROP: ["dst", "object", "key"],
  SET_PROP: ["object", "key", "src"],
  DEFINE_PROP: ["object", "key", "src", "flags", "setter"],
  DELETE_PROP: ["dst", "object", "key"],
  SET_PROTO: ["object", "prototype"],
  TO_PROPERTY_KEY: ["dst", "src"],
  INIT_PRIVATE: ["object", "key", "src", "readonly"],
  GET_PRIVATE: ["dst", "object", "key"],
  SET_PRIVATE: ["object", "key", "src"],
  HAS_PRIVATE: ["dst", "object", "key"],
  INIT_SLOT: ["object", "literal", "src"],
  SET_BEHAVIOR: ["object", "steps", "constructor"],
  CALL: ["dst", "callee", "this", "args", "argc"],
  CONSTRUCT: ["dst", "callee", "unused", "args", "argc"],
  RETURN: ["src"],
  AWAIT: ["dst", "src"],
  THROW: ["src"],
  THROW_ERROR: ["literal", "literal"],
  JUMP: ["target"],
  JUMP_IF_FALSY: ["condition", "target"],
  JUMP_IF_TRUTHY: ["condition", "target"],
  JUMP_IF_NOT_NULLISH: ["src", "target"],
  JUMP_IF_NOT_UNDEFINED: ["src", "target"],
  JUMP_AND_LINK: ["link", "target"],
  JUMP_INDIRECT: ["link"],
  GET_ITERATOR: ["iterator", "next", "src"],
  GET_FOR_IN_ITERATOR: ["iterator", "next", "src"],
  ITERATOR_NEXT: ["dst", "iterator", "next", "done"],
  ITERATOR_CLOSE: ["iterator", "throwing"],
}
for (const name of [
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "MOD",
  "EXP",
  "BIT_AND",
  "BIT_OR",
  "BIT_XOR",
  "SHL",
  "SHR",
  "USHR",
  "EQ",
  "NOT_EQ",
  "STRICT_EQ",
  "STRICT_NOT_EQ",
  "LT",
  "LT_EQ",
  "GT",
  "GT_EQ",
  "IN",
  "INSTANCEOF",
])
  OPERANDS[name] = ["dst", "left", "right"]
for (const name of [
  "NOT",
  "NEGATE",
  "TO_NUMBER",
  "BIT_NOT",
  "TYPEOF",
  "TO_STRING",
])
  OPERANDS[name] = ["dst", "src"]

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
    for (const { start, end, target, register } of fn.handlers)
      lines.push(
        `  handler ${start}..${end} -> ${target} exception=${register}`,
      )
  }
  return lines.join("\n") + "\n\n"
}
