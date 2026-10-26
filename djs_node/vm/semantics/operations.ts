import { panic } from "../../utils.ts"
import type { Literal } from "../../compiler/compile.ts"
import type { Root } from "../storage/value.ts"
import {
  TAGS,
  get_ref,
  kind_of,
  read_boolean,
  read_number,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { KINDS, is_object_kind } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import { read_string, write_string } from "../records/string.ts"
import {
  has_error_prototype,
  has_property_list,
  prototype_of_reference,
} from "../records/object.ts"
import { get_property } from "./properties.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"
import { OP } from "../../compiler/bytecode.ts"
import type { Opcode } from "../../compiler/bytecode.ts"

export function to_string(runtime: Runtime, value: Root): string {
  const { memory } = runtime
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
      return "undefined"
    case TAGS.NULL:
      return "null"
    case TAGS.NUMBER:
      return String(read_number(memory, value))
    case TAGS.BOOLEAN:
      return String(read_boolean(memory, value))
    case TAGS.REF:
      switch (kind_of(memory, value)) {
        case KINDS.STRING:
          return read_string(memory, value)
        case KINDS.SYMBOL:
          panic("Cannot convert a Symbol value to a string")
        case KINDS.FUNCTION:
          return "[Function]"
        case KINDS.OBJECT:
          if (!has_error_prototype(memory, value)) return "[object Object]"
        case KINDS.ERROR: {
          const key = memory.alloc_root(),
            text = memory.alloc_root()
          try {
            write_string(memory, key, "name")
            get_property(runtime, text, value, key)
            const name = to_string(runtime, text)
            write_string(memory, key, "message")
            get_property(runtime, text, value, key)
            return name + ": " + to_string(runtime, text)
          } finally {
            memory.free_root(key)
            memory.free_root(text)
          }
        }
        default:
          return "[object Object]"
      }
    default:
      panic("Invalid internal value exposed to guest code")
  }
}

export function truthy(runtime: Runtime, value: Root) {
  const { memory } = runtime
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
    case TAGS.NULL:
      return false
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.NUMBER:
      return Boolean(read_number(memory, value))
    case TAGS.REF:
      return (
        kind_of(memory, value) !== KINDS.STRING ||
        read_string(memory, value).length !== 0
      )
    default:
      panic("Invalid internal value")
  }
}

export function primitive(runtime: Runtime, value: Root): Literal {
  const { memory } = runtime
  switch (tag_of(memory, value)) {
    case TAGS.NUMBER:
      return read_number(memory, value)
    case TAGS.UNDEFINED:
      return undefined
    case TAGS.NULL:
      return null
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.REF:
      if (kind_of(memory, value) === KINDS.STRING)
        return read_string(memory, value)
      panic("Expected a primitive value")
    default:
      panic("Invalid internal value")
  }
}

export function write_primitive(
  runtime: Runtime,
  destination: Root,
  value: unknown,
) {
  const { memory } = runtime
  if (typeof value === "string") write_string(memory, destination, value)
  else if (typeof value === "number") write_number(memory, destination, value)
  else if (typeof value === "boolean") write_boolean(memory, destination, value)
  else if (value === undefined) write_undefined(memory, destination)
  else panic("Unsupported primitive result")
}

export function same_value(runtime: Runtime, left: Root, right: Root) {
  const { memory } = runtime
  if (tag_of(memory, left) !== tag_of(memory, right)) return false
  if (tag_of(memory, left) === TAGS.REF) {
    if (
      kind_of(memory, left) === KINDS.STRING &&
      kind_of(memory, right) === KINDS.STRING
    )
      return read_string(memory, left) === read_string(memory, right)
    return get_ref(memory, left) === get_ref(memory, right)
  }
  return Object.is(primitive(runtime, left), primitive(runtime, right))
}

// Host operators can only coerce primitives; objects must be converted first.
function check_primitive(runtime: Runtime, value: Root): Status {
  if (kind_of(runtime.memory, value) === KINDS.SYMBOL)
    return throw_error(runtime, "TypeError", "Cannot convert a Symbol value")
  if (kind_of(runtime.memory, value) > KINDS.STRING)
    return throw_error(
      runtime,
      "TypeError",
      "Object coercion is not implemented yet",
    )
  return OK
}

// Applied to primitives; operands that were objects are converted first.
const PRIMITIVE_OPERATORS: Partial<
  Record<Opcode, (a: any, b: any) => unknown>
> = {
  [OP.ADD]: (a, b) => a + b,
  [OP.SUB]: (a, b) => a - b,
  [OP.MUL]: (a, b) => a * b,
  [OP.DIV]: (a, b) => a / b,
  [OP.MOD]: (a, b) => a % b,
  [OP.EXP]: (a, b) => a ** b,
  [OP.BIT_AND]: (a, b) => a & b,
  [OP.BIT_OR]: (a, b) => a | b,
  [OP.BIT_XOR]: (a, b) => a ^ b,
  [OP.SHL]: (a, b) => a << b,
  [OP.SHR]: (a, b) => a >> b,
  [OP.USHR]: (a, b) => a >>> b,
  [OP.LT]: (a, b) => a < b,
  [OP.LT_EQ]: (a, b) => a <= b,
  [OP.GT]: (a, b) => a > b,
  [OP.GT_EQ]: (a, b) => a >= b,
}

export function primitive_operation(
  runtime: Runtime,
  destination: Root,
  left: Root,
  right: Root,
  opcode: Opcode,
): Status {
  if (check_primitive(runtime, left) === THROW) return THROW
  if (check_primitive(runtime, right) === THROW) return THROW
  const operator = PRIMITIVE_OPERATORS[opcode]
  if (operator === undefined) panic(`Not a primitive operator: ${opcode}`)
  // Host operators perform JavaScript coercion on the guest primitives.
  write_primitive(
    runtime,
    destination,
    operator(primitive(runtime, left), primitive(runtime, right)),
  )
  return OK
}

/** Objects and symbols are equal only to themselves. */
function equals(runtime: Runtime, left: Root, right: Root, loose: boolean) {
  const { memory } = runtime
  if (
    kind_of(memory, left) > KINDS.STRING ||
    kind_of(memory, right) > KINDS.STRING
  )
    return (
      tag_of(memory, left) === TAGS.REF &&
      tag_of(memory, right) === TAGS.REF &&
      get_ref(memory, left) === get_ref(memory, right)
    )
  const a = primitive(runtime, left),
    b = primitive(runtime, right)
  return loose ? a == b : a === b
}

export function strict_equals(runtime: Runtime, left: Root, right: Root) {
  return equals(runtime, left, right, false)
}

/** For operands that ToPrimitive has already converted where `==` requires. */
export function loose_equals(runtime: Runtime, left: Root, right: Root) {
  return equals(runtime, left, right, true)
}

export function instance_of(
  runtime: Runtime,
  destination: Root,
  left: Root,
  right: Root,
): Status {
  const { memory } = runtime
  if (kind_of(memory, right) !== KINDS.FUNCTION)
    return throw_error(runtime, "TypeError", "Expected a constructor")
  const key = memory.alloc_root(),
    prototype = memory.alloc_root()
  try {
    write_string(memory, key, "prototype")
    get_property(runtime, prototype, right, key)
    if (!has_property_list(memory, prototype))
      return throw_error(runtime, "TypeError", "Expected an object")
    let found = false
    if (is_object_kind(kind_of(memory, left))) {
      let reference = get_ref(memory, left)
      while (reference !== 0) {
        reference = prototype_of_reference(memory, reference)
        if (reference === get_ref(memory, prototype)) {
          found = true
          break
        }
      }
    }
    write_boolean(memory, destination, found)
    return OK
  } finally {
    memory.free_root(key)
    memory.free_root(prototype)
  }
}

export function type_of(runtime: Runtime, destination: Root, source: Root) {
  const { memory } = runtime
  const tag = tag_of(memory, source)
  const kind = kind_of(memory, source)
  const result =
    tag === TAGS.UNDEFINED
      ? "undefined"
      : tag === TAGS.NUMBER
        ? "number"
        : tag === TAGS.BOOLEAN
          ? "boolean"
          : kind === KINDS.STRING
            ? "string"
            : kind === KINDS.SYMBOL
              ? "symbol"
              : kind === KINDS.FUNCTION
                ? "function"
                : "object"
  write_string(memory, destination, result)
}

/** NEGATE, TO_NUMBER and BIT_NOT, on a primitive operand. */
export function numeric_unary_operation(
  runtime: Runtime,
  destination: Root,
  source: Root,
  opcode: Opcode,
): Status {
  if (check_primitive(runtime, source) === THROW) return THROW
  const value: any = primitive(runtime, source)
  const { memory } = runtime
  if (opcode === OP.NEGATE) write_number(memory, destination, -value)
  else if (opcode === OP.TO_NUMBER) write_number(memory, destination, +value)
  else if (opcode === OP.BIT_NOT) write_number(memory, destination, ~value)
  else panic(`Not a numeric unary operator: ${opcode}`)
  return OK
}
