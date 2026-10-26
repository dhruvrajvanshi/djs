import type { BindingLocation, Literal, CompiledModule } from "./compile.ts"
import { PROPERTY_KIND } from "./compile.ts"
import {
  OP,
  INSTRUCTION_BYTES,
  NO_HOLES,
  decode_instruction,
} from "./bytecode.ts"
import { record_invert } from "../utils.ts"
import { styleText } from "node:util"

/**
 * How each operand word is shown: `dst` is a register written by the
 * instruction and printed left of `=`; `reg` a register read; `literal`,
 * `function` and `block` index their pools; `binding` consumes two words
 * (depth, slot); `@label` is a jump target and `=label` an immediate, both
 * printed as `label=value` unless the label is empty; `_` is unused.
 */
type Operand =
  | "dst"
  | "reg"
  | "literal"
  | "function"
  | "block"
  | "binding"
  | "_"
  | `@${string}`
  | `=${string}`

interface Formatted {
  dsts: string[]
  args: string[]
}

type Style = (format: Parameters<typeof styleText>[0], text: string) => string

interface Context {
  unit: CompiledModule
  style: Style
}

type Formatter = (words: number[], context: Context) => Formatted

// Operand order matches the fixed-width words read by the interpreter.
const OPERANDS: Record<string, Operand[] | Formatter> = {
  LOAD_CONST: ["dst", "literal"],
  CREATE_REGEXP: ["dst", "reg", "reg"],
  COPY_DATA_PROPERTIES: ["reg", "reg"],
  BIND_THIS: ["reg"],
  MOVE: ["dst", "reg"],
  LOAD_THIS: ["dst"],
  LOAD_NEW_TARGET: ["dst"],
  LOAD_GLOBAL: ["dst", "literal", "=allow_missing"],
  LOAD_BINDING: ["dst", "binding"],
  INIT_BINDING: ["binding", "reg"],
  STORE_BINDING: ["binding", "reg"],
  PUSH_ENV: ["block"],
  POP_ENV: ["="],
  COPY_ENV: ["block"],
  CREATE_OBJECT: format_object,
  CREATE_ARRAY: format_array,
  CREATE_CLOSURE: ["dst", "function"],
  CREATE_CLASS: format_class,
  SET_FUNCTION_NAME: ["reg", "reg", "literal"],
  GET_PROP: ["dst", "reg", "reg"],
  SET_PROP: ["reg", "reg", "reg"],
  DEFINE_PROP: ["reg", "reg", "reg", "=flags", "=setter"],
  DELETE_PROP: ["dst", "reg", "reg"],
  SET_PROTO: ["reg", "reg"],
  TO_PROPERTY_KEY: ["dst", "reg"],
  INIT_PRIVATE: ["reg", "reg", "reg", "=readonly"],
  GET_PRIVATE: ["dst", "reg", "reg"],
  SET_PRIVATE: ["reg", "reg", "reg"],
  HAS_PRIVATE: ["dst", "reg", "reg"],
  INIT_SLOT: ["reg", "literal", "reg"],
  SET_BEHAVIOR: ["reg", "reg", "=constructor"],
  CALL: ([dst, callee, receiver, first, count]) => ({
    dsts: [register(dst)],
    args: [
      register(callee),
      `this=${register(receiver)}`,
      register_list(first, count),
    ],
  }),
  CONSTRUCT: ([dst, callee, , first, count]) => ({
    dsts: [register(dst)],
    args: [register(callee), register_list(first, count)],
  }),
  CALL_SPREAD: ([dst, callee, receiver, first, count]) => ({
    dsts: [register(dst)],
    args: [
      register(callee),
      `this=${register(receiver)}`,
      register_list(first, count, true),
    ],
  }),
  CONSTRUCT_SPREAD: ([dst, callee, , first, count]) => ({
    dsts: [register(dst)],
    args: [register(callee), register_list(first, count, true)],
  }),
  RETURN: ["reg"],
  AWAIT: ["dst", "reg"],
  THROW: ["reg"],
  THROW_ERROR: ["literal", "literal"],
  JUMP: ["@"],
  JUMP_IF_FALSY: ["reg", "@"],
  JUMP_IF_TRUTHY: ["reg", "@"],
  JUMP_IF_NOT_NULLISH: ["reg", "@"],
  JUMP_IF_NOT_UNDEFINED: ["reg", "@"],
  JUMP_AND_LINK: ["dst", "@"],
  JUMP_INDIRECT: ["reg"],
  GET_ITERATOR: ["dst", "dst", "reg"],
  GET_FOR_IN_ITERATOR: ["dst", "dst", "reg"],
  ITERATOR_NEXT: ["dst", "reg", "reg", "@done"],
  ITERATOR_CLOSE: ["reg", "=throwing"],
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
  OPERANDS[name] = ["dst", "reg", "reg"]
for (const name of [
  "NOT",
  "NEGATE",
  "TO_NUMBER",
  "BIT_NOT",
  "TYPEOF",
  "TO_STRING",
])
  OPERANDS[name] = ["dst", "reg"]

const OPCODE_NAMES = record_invert(OP)

const CONTROL_FLOW = new Set([
  "RETURN",
  "AWAIT",
  "THROW",
  "THROW_ERROR",
  "JUMP",
  "JUMP_IF_FALSY",
  "JUMP_IF_TRUTHY",
  "JUMP_IF_NOT_NULLISH",
  "JUMP_IF_NOT_UNDEFINED",
  "JUMP_AND_LINK",
  "JUMP_INDIRECT",
  "ITERATOR_NEXT",
])

function format_literal(value: Literal, style: Style): string {
  if (typeof value === "string") return style("green", JSON.stringify(value))
  if (value === undefined) return style("blue", "undefined")
  if (value === null) return style("blue", "null")
  return style("yellow", Object.is(value, -0) ? "-0" : String(value))
}

function register(index: number): string {
  return `%${index}`
}

function register_list(
  first: number,
  count: number,
  spread: boolean = false,
): string {
  const items = Array.from({ length: count }, (_, i) => register(first + i))
  if (spread) items.push(`...${register(first + count)}`)
  return `(${items.join(", ")})`
}

function function_ref(unit: CompiledModule, id: number): string {
  return `fn#${id} ${JSON.stringify(unit.functions[id].name)}`
}

function property_key({ unit, style }: Context, key: number): string {
  const value = unit.literals[key]
  return typeof value === "string" && /^[A-Za-z_$][\w$]*$/.test(value)
    ? value
    : format_literal(value, style)
}

function kind_prefix(kind: number): string {
  if (kind === PROPERTY_KIND.GETTER) return "get "
  if (kind === PROPERTY_KIND.SETTER) return "set "
  return ""
}

function braced(members: string[]): string {
  return members.length ? `{ ${members.join(", ")} }` : "{}"
}

function format_object(
  [dst, template, first]: number[],
  context: Context,
): Formatted {
  let next = first
  const members = context.unit.object_templates[template].entries.map(
    ({ key, kind }) => {
      const name =
        key === null ? `[${register(next++)}]` : property_key(context, key)
      return `${kind_prefix(kind)}${name}: ${register(next++)}`
    },
  )
  return { dsts: [register(dst)], args: [braced(members)] }
}

function format_array(
  [dst, first, length, holes]: number[],
  { unit }: Context,
): Formatted {
  const absent = holes === NO_HOLES ? [] : unit.array_holes[holes]
  const elements = Array.from({ length }, (_, i) =>
    absent.includes(i) ? "<hole>" : register(first + i),
  )
  return { dsts: [register(dst)], args: [`[${elements.join(", ")}]`] }
}

function format_class(
  [dst, class_id, first]: number[],
  context: Context,
): Formatted {
  const { unit } = context
  const descriptor = unit.classes[class_id]
  let next = first
  const members = descriptor.members.map((member) => {
    const name =
      member.key === null
        ? `[${register(next++)}]`
        : property_key(context, member.key)
    const prefix =
      (member.is_static ? "static " : "") + kind_prefix(member.kind)
    return `${prefix}${name}: ${function_ref(unit, member.function)}`
  })
  return {
    dsts: [register(dst)],
    args: [
      `${function_ref(unit, descriptor.constructor_function)} ${braced(members)}`,
    ],
  }
}

function format_operands(
  operands: Operand[],
  words: number[],
  { unit, style }: Context,
): Formatted {
  const dsts: string[] = []
  const args: string[] = []
  let word = 0
  for (const operand of operands) {
    const value = words[word++]
    if (operand === "dst") dsts.push(register(value))
    else if (operand === "reg") args.push(register(value))
    else if (operand === "literal")
      args.push(format_literal(unit.literals[value], style))
    else if (operand === "function") args.push(function_ref(unit, value))
    else if (operand === "block") args.push(`block#${value}`)
    else if (operand === "binding") args.push(`env[${value}].${words[word++]}`)
    else if (operand[0] === "@" || operand[0] === "=") {
      const label = operand.slice(1)
      const shown = operand[0] === "@" ? `@${value}` : String(value)
      args.push(label ? `${label}=${shown}` : shown)
    }
  }
  return { dsts, args }
}

function binding_location(location: BindingLocation): string {
  return "register" in location
    ? register(location.register)
    : `env[0].${location.slot}`
}

export function disassemble_module(
  unit: CompiledModule,
  color: boolean = false,
): string {
  const style: Style = (format, text) =>
    color ? styleText(format, text, { validateStream: false }) : text
  const context = { unit, style }
  const lines = [`Module ${JSON.stringify(unit.path)}`]
  for (const fn of unit.functions) {
    const params = fn.parameters.map(binding_location)
    if (fn.rest) params.push(`...${binding_location(fn.rest)}`)
    lines.push(
      "",
      `${style(["bold", "green"], `function ${fn.name}`)}(${params.join(", ")}) #${fn.id}  ; slots=${fn.slot_count}, bindings=${fn.binding_count}`,
    )
    const bytes = fn.bytecode
    const pc_width = String(
      Math.max(0, bytes.length - INSTRUCTION_BYTES),
    ).length
    for (let pc = 0; pc < bytes.length; pc += INSTRUCTION_BYTES) {
      const { opcode, a, b, c, d, e } = decode_instruction(bytes, pc)
      const name = OPCODE_NAMES[opcode]!
      const words = [a, b, c, d, e]
      const spec = OPERANDS[name]
      const { dsts, args } =
        typeof spec === "function"
          ? spec(words, context)
          : format_operands(spec, words, context)
      const assigned = dsts.length ? `${dsts.join(", ")} = ` : ""
      const operands = args.length ? ` ${args.join(", ")}` : ""
      lines.push(
        `  ${style("dim", `${String(pc).padStart(pc_width)}:`)} ${assigned}${style(CONTROL_FLOW.has(name) ? "magenta" : "cyan", name)}${operands}`,
      )
    }
    for (const { start, end, target, register: exception } of fn.handlers)
      lines.push(
        `  handler ${start}..${end} -> @${target} exception=${register(exception)}`,
      )
  }
  return lines.join("\n") + "\n\n"
}
