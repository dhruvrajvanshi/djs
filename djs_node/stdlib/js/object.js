import {
  is_array,
  object_create,
  string_box,
  ordinary_own_property_keys,
  array_create,
  builtin_function,
} from "djs:intrinsics"
import { get_prototype_from_constructor, make_constructor } from "djs:abstract"
import { is_object, define_methods } from "./support.js"

// Evaluated first, so objects created afterwards inherit from Object.prototype.
export const object_prototype = object_create(null)

function Object(value) {
  if (new.target !== undefined && new.target !== Object)
    return object_create(
      get_prototype_from_constructor(new.target, object_prototype),
    )
  if (typeof value === "string") return string_box(value)
  if (is_object(value)) return value
  return object_create(object_prototype)
}
builtin_function(Object, 1)
make_constructor(Object, object_prototype)

define_methods(Object, {
  getOwnPropertySymbols(value) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined")
    const keys = ordinary_own_property_keys(Object(value))
    const symbols = array_create(0)
    let index = 0
    while (index < keys.length) {
      if (typeof keys[index] === "symbol") symbols[symbols.length] = keys[index]
      index = index + 1
    }
    return symbols
  },
})

define_methods(object_prototype, {
  valueOf() {
    return this
  },

  toString() {
    if (this === undefined) return "[object Undefined]"
    if (this === null) return "[object Null]"
    if (is_array(this)) return "[object Array]"
    return "[object Object]"
  },
})

export default Object
