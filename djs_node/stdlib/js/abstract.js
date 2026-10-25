import {
  call,
  string_box,
  object_create,
  define_property,
  is_array,
} from "djs:intrinsics"

export function is_object(value) {
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
  return object_create(object_prototype)
}
export function to_integer(value) {
  const number = to_number(value)
  if (number !== number || number === 0) return 0
  if (number === Infinity || number === -Infinity) return number
  return number - (number % 1)
}
export function to_length(value) {
  const length = to_integer(value)
  if (length <= 0) return 0
  return length > 9007199254740991 ? 9007199254740991 : length
}
export function relative_index(value, length) {
  const index = to_integer(value)
  if (index < 0) return index < -length ? 0 : length + index
  return index > length ? length : index
}
export function callable(value) {
  if (typeof value !== "function")
    throw new TypeError("Callback is not callable")
  return value
}
export function create_data_property(object, key, value) {
  define_property(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}
export function method(object, key, value, length) {
  define_property(value, "name", { value: key, configurable: true })
  define_property(value, "length", { value: length, configurable: true })
  define_property(object, key, { value, writable: true, configurable: true })
}
export function check_length(length) {
  if (length > 9007199254740991)
    throw new TypeError("Array-like length exceeds maximum")
}

export const object_prototype = {
  valueOf() {
    return this
  },
  toString() {
    if (this === undefined) return "[object Undefined]"
    if (this === null) return "[object Null]"
    if (is_array(this)) return "[object Array]"
    return "[object Object]"
  },
}

method(object_prototype, "valueOf", object_prototype.valueOf, 0)
method(object_prototype, "toString", object_prototype.toString, 0)
