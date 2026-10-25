// Helpers shared by the builtins that are not spec abstract operations.
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
