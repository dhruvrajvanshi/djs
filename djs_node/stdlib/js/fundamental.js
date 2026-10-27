// 20 Fundamental Objects: Object and Function. They live in one module because
// %Object% inherits from %Function.prototype%, which inherits from
// %Object.prototype%.
import {
  well_known,
  slot,
  internal_method,
  attributes,
  is_array,
  ordinary_object_create,
  string_create,
  ordinary_own_property_keys,
  array_create,
  create_builtin_function,
  get_own_property,
} from "djs:native"
import {
  get_prototype_from_constructor,
  to_property_key,
  to_object,
} from "djs:abstract"
import { is_object } from "./support.js"

// 20.1.1 The Object Constructor
export const Object = well_known("%Object%", create_builtin_function, {
  [slot("[[Prototype]]")]: FunctionPrototype,

  // 20.1.1.1 Object ( [ value ] )
  [internal_method("[[Call]]", "[[Construct]]")]: function Object(value) {
    if (new.target !== undefined && new.target !== Object)
      return ordinary_object_create(
        get_prototype_from_constructor(new.target, ObjectPrototype),
      )
    if (typeof value === "string") return string_create(value)
    if (is_object(value)) return value
    return ordinary_object_create(ObjectPrototype)
  },

  // 20.1.2 Properties of the Object Constructor
  getOwnPropertySymbols(value) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined to object")
    const keys = ordinary_own_property_keys(Object(value))
    const symbols = array_create(0)
    let index = 0
    while (index < keys.length) {
      if (typeof keys[index] === "symbol") symbols[symbols.length] = keys[index]
      index = index + 1
    }
    return symbols
  },

  // 20.1.2.2 Object.getOwnPropertyDescriptor ( O, P )
  getOwnPropertyDescriptor(value, property) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined to object")
    const coerced = to_object(value)
    const propertyKey = to_property_key(property)
    return get_own_property(coerced, propertyKey)
  },

  prototype: attributes(
    { writable: false, configurable: false },
    ObjectPrototype,
  ),
})

// 20.1.3 Properties of the Object Prototype Object
export const ObjectPrototype = well_known(
  "%Object.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: null,

    constructor: Object,

    valueOf() {
      return this
    },

    toString() {
      if (this === undefined) return "[object Undefined]"
      if (this === null) return "[object Null]"
      if (is_array(this)) return "[object Array]"
      return "[object Object]"
    },
  },
)

// 20.2.3 Properties of the Function Prototype Object
export const FunctionPrototype = well_known(
  "%Function.prototype%",
  create_builtin_function,
  {
    [slot("[[Prototype]]")]: ObjectPrototype,

    // Accepts any arguments and returns undefined.
    [internal_method("[[Call]]")]: function () {},
  },
)
