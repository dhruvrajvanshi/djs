// Abstract operations from the ECMAScript specification, named after it.
import {
  abstract_operation,
  call,
  string_create,
  define_property_or_throw,
} from "djs:native"

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

// 7.1.1 ToPrimitive ( input [ , preferredType ] )
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
abstract_operation("ToPrimitive", to_primitive)

// 7.1.17 ToString ( argument )
export function to_string(value) {
  return "" + to_primitive(value, "string")
}
abstract_operation("ToString", to_string)
// 7.1.4 ToNumber ( argument )
export function to_number(value) {
  return +to_primitive(value, "number")
}
abstract_operation("ToNumber", to_number)
export function to_object(value) {
  require_object_coercible(value)
  if (typeof value === "string") return string_create(value)
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
  define_property_or_throw(object, key, {
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
  define_property_or_throw(object, key, {
    value,
    writable: true,
    configurable: true,
  })
}

export function get_prototype_from_constructor(constructor, default_prototype) {
  const prototype = constructor.prototype
  return is_object(prototype) ? prototype : default_prototype
}
