// Helpers shared by the builtins that are not spec abstract operations.
import {
  define_property,
  ordinary_own_property_keys,
  get_own_property_descriptor,
} from "djs:intrinsics"
import { to_integer_or_infinity } from "djs:abstract"

export function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}
export function relative_index(value, length) {
  const index = to_integer_or_infinity(value)
  if (index < 0) return index < -length ? 0 : length + index
  return index > length ? length : index
}
export function callable(value) {
  if (typeof value !== "function")
    throw new TypeError("Callback is not callable")
  return value
}
export function check_length(length) {
  if (length > 9007199254740991)
    throw new TypeError("Array-like length exceeds maximum")
}

// Copies the methods and accessors of an object literal as built-in
// properties, which are not enumerable.
export function define_methods(object, methods) {
  const keys = ordinary_own_property_keys(methods)
  let index = 0
  let descriptor
  while (index < keys.length) {
    descriptor = get_own_property_descriptor(methods, keys[index])
    descriptor.enumerable = false
    define_property(object, keys[index], descriptor)
    index = index + 1
  }
}
