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
  is_object,
  prototype_of_reference,
} from "../records/object.ts"
import { get_property, has_property } from "./properties.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

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

export function binary_operation(
  runtime: Runtime,
  destination: Root,
  left: Root,
  right: Root,
  operator: string,
): Status {
  const { memory } = runtime
  if (operator === "in") {
    if (!is_object(memory, right))
      panic("Right operand of in must be an object")
    write_boolean(memory, destination, has_property(runtime, right, left))
    return OK
  }
  if (operator === "instanceof") {
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
  if (
    ["===", "!==", "==", "!="].includes(operator) &&
    (kind_of(memory, left) > KINDS.STRING ||
      kind_of(memory, right) > KINDS.STRING)
  ) {
    const equal =
      tag_of(memory, left) === TAGS.REF &&
      tag_of(memory, right) === TAGS.REF &&
      get_ref(memory, left) === get_ref(memory, right)
    write_boolean(
      memory,
      destination,
      operator === "===" || operator === "==" ? equal : !equal,
    )
    return OK
  }
  if (check_primitive(runtime, left) === THROW) return THROW
  if (check_primitive(runtime, right) === THROW) return THROW
  // Host operators perform JavaScript coercion on the guest primitives.
  const a: any = primitive(runtime, left),
    b: any = primitive(runtime, right)
  let result
  switch (operator) {
    case "+":
      result = a + b
      break
    case "-":
      result = a - b
      break
    case "*":
      result = a * b
      break
    case "/":
      result = a / b
      break
    case "%":
      result = a % b
      break
    case "**":
      result = a ** b
      break
    case "===":
      result = a === b
      break
    case "!==":
      result = a !== b
      break
    case "==":
      result = a == b
      break
    case "!=":
      result = a != b
      break
    case "<":
      result = a < b
      break
    case "<=":
      result = a <= b
      break
    case ">":
      result = a > b
      break
    case ">=":
      result = a >= b
      break
    case "&":
      result = a & b
      break
    case "|":
      result = a | b
      break
    case "^":
      result = a ^ b
      break
    case "<<":
      result = a << b
      break
    case ">>":
      result = a >> b
      break
    case ">>>":
      result = a >>> b
      break
    default:
      panic(`Unsupported binary operator: ${operator}`)
  }
  write_primitive(runtime, destination, result)
  return OK
}

export function unary_operation(
  runtime: Runtime,
  destination: Root,
  source: Root,
  operator: string,
): Status {
  const { memory } = runtime
  if (operator === "!") {
    write_boolean(memory, destination, !truthy(runtime, source))
    return OK
  }
  if (operator === "void") {
    write_undefined(memory, destination)
    return OK
  }
  if (operator === "typeof") {
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
    return OK
  }
  if (check_primitive(runtime, source) === THROW) return THROW
  const value: any = primitive(runtime, source)
  if (operator === "+") write_number(memory, destination, +value)
  else if (operator === "-") write_number(memory, destination, -value)
  else if (operator === "~") write_number(memory, destination, ~value)
  else panic(`Unsupported unary operator: ${operator}`)
  return OK
}
