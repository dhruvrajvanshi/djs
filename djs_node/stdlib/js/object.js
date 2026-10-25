import {
  is_array,
  object_create,
  string_box,
  array_create,
  ordinary_own_property_keys,
} from "djs:intrinsics"

// Must not import other stdlib modules: it is evaluated first so that objects
// created afterwards inherit from Object.prototype.
@builtin({ name: "Object", length: 1 })
class Object {
  @internalMethod("Call")
  static #call(thisArgument, args) {
    return from_value(args[0])
  }

  @internalMethod("Construct")
  static #construct(args, newTarget) {
    if (newTarget === Object) return from_value(args[0])
    const prototype = newTarget.prototype
    return object_create(is_object(prototype) ? prototype : Object.prototype)
  }

  static getOwnPropertySymbols(value) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined")
    const keys = ordinary_own_property_keys(from_value(value))
    const symbols = array_create(0)
    let index = 0
    while (index < keys.length) {
      if (typeof keys[index] === "symbol") symbols[symbols.length] = keys[index]
      index = index + 1
    }
    return symbols
  }

  valueOf() {
    return this
  }

  toString() {
    if (this === undefined) return "[object Undefined]"
    if (this === null) return "[object Null]"
    if (is_array(this)) return "[object Array]"
    return "[object Object]"
  }
}

function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}

function from_value(value) {
  if (typeof value === "string") return string_box(value)
  if (is_object(value)) return value
  return object_create(Object.prototype)
}

export default Object
