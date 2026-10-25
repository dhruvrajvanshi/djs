// Abstract operations from the ECMAScript specification, named after it.
import { call, string_box, define_property } from "djs:intrinsics"

function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}

export function require_object_coercible(value) {
  if (value === null || value === undefined)
    throw new TypeError("Cannot convert null or undefined")
  return value
}

export function to_primitive(value, hint) {
  if (!is_object(value)) return value
  let first = hint === "string" ? value.toString : value.valueOf
  if (typeof first === "function") {
    const result = call(first, value)
    if (!is_object(result)) return result
  }
  const second = hint === "string" ? value.valueOf : value.toString
  if (typeof second === "function") {
    const result = call(second, value)
    if (!is_object(result)) return result
  }
  throw new TypeError("Cannot convert object to primitive")
}

export function to_string(value) {
  return "" + to_primitive(value, "string")
}
export function to_number(value) {
  return +to_primitive(value, "number")
}
export function to_object(value) {
  require_object_coercible(value)
  if (typeof value === "string") return string_box(value)
  if (is_object(value)) return value
  return {}
}
export function to_integer_or_infinity(value) {
  const number = to_number(value)
  if (number !== number || number === 0) return 0
  if (number === Infinity || number === -Infinity) return number
  return number - (number % 1)
}
export function to_length(value) {
  const length = to_integer_or_infinity(value)
  if (length <= 0) return 0
  return length > 9007199254740991 ? 9007199254740991 : length
}
export function create_data_property_or_throw(object, key, value) {
  define_property(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}
export function create_non_enumerable_data_property_or_throw(
  object,
  key,
  value,
) {
  define_property(object, key, { value, writable: true, configurable: true })
}

export function get_prototype_from_constructor(constructor, default_prototype) {
  const prototype = constructor.prototype
  return is_object(prototype) ? prototype : default_prototype
}

// Built-in constructors have a read-only prototype whose constructor
// property is hidden.
export function make_constructor(constructor, prototype) {
  define_property(constructor, "prototype", { value: prototype })
  create_non_enumerable_data_property_or_throw(
    prototype,
    "constructor",
    constructor,
  )
}
