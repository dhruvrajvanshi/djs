import { panic } from "../../utils.ts"
import type { Literal } from "../../compiler/compile.ts"
import type { Handle } from "../storage/heap.ts"
import {
  VALUE_TAGS,
  get_ref,
  heap_type_of,
  read_boolean,
  read_number,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { HEAP_TYPES, is_object_type } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import { read_string, write_string } from "../heap_types/string.ts"
import {
  has_property_list,
  prototype_of_reference,
} from "../heap_types/object.ts"
import { load_property } from "./properties.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"
import { OP } from "../../compiler/bytecode.ts"
import type { Opcode } from "../../compiler/bytecode.ts"

export function to_string(runtime: Runtime, value: Handle): string {
  const { heap } = runtime
  switch (tag_of(heap, value)) {
    case VALUE_TAGS.UNDEFINED:
      return "undefined"
    case VALUE_TAGS.NULL:
      return "null"
    case VALUE_TAGS.NUMBER:
      return String(read_number(heap, value))
    case VALUE_TAGS.BOOLEAN:
      return String(read_boolean(heap, value))
    case VALUE_TAGS.REF:
      switch (heap_type_of(heap, value)) {
        case HEAP_TYPES.STRING:
          return read_string(heap, value)
        case HEAP_TYPES.SYMBOL:
          panic("Cannot convert a Symbol value to a string")
        case HEAP_TYPES.FUNCTION:
          return "[Function]"
        default:
          return "[object Object]"
      }
    default:
      panic("Invalid internal value exposed to guest code")
  }
}

export function truthy(runtime: Runtime, value: Handle) {
  const { heap } = runtime
  switch (tag_of(heap, value)) {
    case VALUE_TAGS.UNDEFINED:
    case VALUE_TAGS.NULL:
      return false
    case VALUE_TAGS.BOOLEAN:
      return read_boolean(heap, value)
    case VALUE_TAGS.NUMBER:
      return Boolean(read_number(heap, value))
    case VALUE_TAGS.REF:
      return (
        heap_type_of(heap, value) !== HEAP_TYPES.STRING ||
        read_string(heap, value).length !== 0
      )
    default:
      panic("Invalid internal value")
  }
}

export function primitive(runtime: Runtime, value: Handle): Literal {
  const { heap } = runtime
  switch (tag_of(heap, value)) {
    case VALUE_TAGS.NUMBER:
      return read_number(heap, value)
    case VALUE_TAGS.UNDEFINED:
      return undefined
    case VALUE_TAGS.NULL:
      return null
    case VALUE_TAGS.BOOLEAN:
      return read_boolean(heap, value)
    case VALUE_TAGS.REF:
      if (heap_type_of(heap, value) === HEAP_TYPES.STRING)
        return read_string(heap, value)
      panic("Expected a primitive value")
    default:
      panic("Invalid internal value")
  }
}

export function write_primitive(
  runtime: Runtime,
  destination: Handle,
  value: unknown,
) {
  const { heap } = runtime
  if (typeof value === "string") write_string(heap, destination, value)
  else if (typeof value === "number") write_number(heap, destination, value)
  else if (typeof value === "boolean") write_boolean(heap, destination, value)
  else if (value === undefined) write_undefined(heap, destination)
  else panic("Unsupported primitive result")
}

export function same_value(runtime: Runtime, left: Handle, right: Handle) {
  const { heap } = runtime
  if (tag_of(heap, left) !== tag_of(heap, right)) return false
  if (tag_of(heap, left) === VALUE_TAGS.REF) {
    if (
      heap_type_of(heap, left) === HEAP_TYPES.STRING &&
      heap_type_of(heap, right) === HEAP_TYPES.STRING
    )
      return read_string(heap, left) === read_string(heap, right)
    return get_ref(heap, left) === get_ref(heap, right)
  }
  return Object.is(primitive(runtime, left), primitive(runtime, right))
}

// Host operators can only coerce primitives; objects must be converted first.
function check_primitive(runtime: Runtime, value: Handle): Status {
  if (heap_type_of(runtime.heap, value) === HEAP_TYPES.SYMBOL)
    return throw_error(runtime, "TypeError", "Cannot convert a Symbol value")
  if (heap_type_of(runtime.heap, value) > HEAP_TYPES.STRING)
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
  destination: Handle,
  left: Handle,
  right: Handle,
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
function equals(runtime: Runtime, left: Handle, right: Handle, loose: boolean) {
  const { heap } = runtime
  if (
    heap_type_of(heap, left) > HEAP_TYPES.STRING ||
    heap_type_of(heap, right) > HEAP_TYPES.STRING
  )
    return (
      tag_of(heap, left) === VALUE_TAGS.REF &&
      tag_of(heap, right) === VALUE_TAGS.REF &&
      get_ref(heap, left) === get_ref(heap, right)
    )
  const a = primitive(runtime, left),
    b = primitive(runtime, right)
  return loose ? a == b : a === b
}

export function strict_equals(runtime: Runtime, left: Handle, right: Handle) {
  return equals(runtime, left, right, false)
}

/** For operands that ToPrimitive has already converted where `==` requires. */
export function loose_equals(runtime: Runtime, left: Handle, right: Handle) {
  return equals(runtime, left, right, true)
}

export function instance_of(
  runtime: Runtime,
  destination: Handle,
  left: Handle,
  right: Handle,
): Status {
  const { heap } = runtime
  if (heap_type_of(heap, right) !== HEAP_TYPES.FUNCTION)
    return throw_error(runtime, "TypeError", "Expected a constructor")
  return heap.handles.scope(() => {
    const key = heap.handles.local(),
      prototype = heap.handles.local()
    write_string(heap, key, "prototype")
    load_property(runtime, prototype, right, key)
    if (!has_property_list(heap, prototype))
      return throw_error(runtime, "TypeError", "Expected an object")
    let found = false
    if (is_object_type(heap_type_of(heap, left))) {
      let reference = get_ref(heap, left)
      while (reference !== 0) {
        reference = prototype_of_reference(heap, reference)
        if (reference === get_ref(heap, prototype)) {
          found = true
          break
        }
      }
    }
    write_boolean(heap, destination, found)
    return OK
  })
}

export function type_of(runtime: Runtime, destination: Handle, source: Handle) {
  const { heap } = runtime
  const tag = tag_of(heap, source)
  const type = heap_type_of(heap, source)
  const result =
    tag === VALUE_TAGS.UNDEFINED
      ? "undefined"
      : tag === VALUE_TAGS.NUMBER
        ? "number"
        : tag === VALUE_TAGS.BOOLEAN
          ? "boolean"
          : type === HEAP_TYPES.STRING
            ? "string"
            : type === HEAP_TYPES.SYMBOL
              ? "symbol"
              : type === HEAP_TYPES.FUNCTION
                ? "function"
                : "object"
  write_string(heap, destination, result)
}

/** NEGATE, TO_NUMBER and BIT_NOT, on a primitive operand. */
export function numeric_unary_operation(
  runtime: Runtime,
  destination: Handle,
  source: Handle,
  opcode: Opcode,
): Status {
  if (check_primitive(runtime, source) === THROW) return THROW
  const value: any = primitive(runtime, source)
  const { heap } = runtime
  if (opcode === OP.NEGATE) write_number(heap, destination, -value)
  else if (opcode === OP.TO_NUMBER) write_number(heap, destination, +value)
  else if (opcode === OP.BIT_NOT) write_number(heap, destination, ~value)
  else panic(`Not a numeric unary operator: ${opcode}`)
  return OK
}
