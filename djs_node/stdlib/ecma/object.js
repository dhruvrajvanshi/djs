import {
  create_builtin_function,
  define_own_property,
  get_own_property,
  kind_of,
  object_create,
  ordinary_own_property_keys,
  ordinary_set_prototype_of,
  well_known_intrinsic_objects,
} from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"
import {
  create_data_property_or_throw,
  define_property_or_throw,
  get_prototype_from_constructor,
  require_object_coercible,
  to_object,
  to_property_key,
} from "./abstract-operations.js"
import { raw_array, raw_array_push } from "../raw/array.js"
import { raw_object } from "../raw/object.js"

const { "%Object.prototype%": object_prototype } = well_known_intrinsic_objects

function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object-constructor
 */
export const Object = create_builtin_function(
  function (value) {
    if (new.target !== undefined && new.target !== Object)
      return object_create(
        get_prototype_from_constructor(new.target, object_prototype),
        "ordinary",
      )
    if (typeof value === "string" || is_object(value)) return to_object(value)
    return object_create(object_prototype, "ordinary")
  },
  { name: "Object", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-object-constructor
 */
define_builtin_properties(Object, {
  create(O, Properties) {
    if (O !== null && !is_object(O))
      throw new TypeError("Object prototype may only be an Object or null")
    const object = object_create(O, "ordinary")
    if (Properties !== undefined) object_define_properties(object, Properties)
    return object
  },

  defineProperty(O, P, Attributes) {
    if (!is_object(O))
      throw new TypeError("Object.defineProperty called on non-object")
    const key = to_property_key(P)
    define_property_or_throw(O, key, to_property_descriptor(Attributes))
    return O
  },

  getOwnPropertySymbols(value) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined to object")
    const keys = ordinary_own_property_keys(Object(value))
    const symbols = []
    let index = 0
    while (index < keys.length) {
      if (typeof keys[index] === "symbol")
        create_data_property_or_throw(symbols, symbols.length, keys[index])
      index = index + 1
    }
    return symbols
  },

  setPrototypeOf(O, proto) {
    require_object_coercible(O)
    if (proto !== null && !is_object(proto))
      throw new TypeError("Object prototype may only be an Object or null")
    if (!is_object(O)) return O
    if (!ordinary_set_prototype_of(O, proto))
      throw new TypeError("Cyclic __proto__ value")
    return O
  },

  getOwnPropertyDescriptor(value, property) {
    if (value === null || value === undefined)
      throw new TypeError("Cannot convert null or undefined to object")
    const coerced = to_object(value)
    const propertyKey = to_property_key(property)
    return get_own_property(coerced, propertyKey)
  },
})
define_own_property(Object, "prototype", {
  value: object_prototype,
  writable: false,
  enumerable: false,
  configurable: false,
})

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-objectdefineproperties
 */
function object_define_properties(object, properties) {
  const props = to_object(properties)
  const keys = ordinary_own_property_keys(props)
  const descriptors = raw_array()
  let index = 0
  while (index < keys.length) {
    const key = keys[index]
    const property = get_own_property(props, key)
    if (property !== undefined && property.enumerable) {
      raw_array_push(descriptors, key)
      raw_array_push(descriptors, to_property_descriptor(props[key]))
    }
    index = index + 1
  }
  index = 0
  while (index < descriptors.length) {
    define_property_or_throw(object, descriptors[index], descriptors[index + 1])
    index = index + 2
  }
}

/**
 * The result is a raw object, so checking a field with `in` never finds one
 * inherited from Object.prototype.
 * https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-topropertydescriptor
 */
function to_property_descriptor(object) {
  if (!is_object(object))
    throw new TypeError("Property description must be an object")
  const descriptor = raw_object()
  if ("enumerable" in object) descriptor.enumerable = !!object.enumerable
  if ("configurable" in object) descriptor.configurable = !!object.configurable
  if ("value" in object) descriptor.value = object.value
  if ("writable" in object) descriptor.writable = !!object.writable
  if ("get" in object) {
    const getter = object.get
    if (getter !== undefined && typeof getter !== "function")
      throw new TypeError("Getter must be a function")
    descriptor.get = getter
  }
  if ("set" in object) {
    const setter = object.set
    if (setter !== undefined && typeof setter !== "function")
      throw new TypeError("Setter must be a function")
    descriptor.set = setter
  }
  if (
    ("get" in descriptor || "set" in descriptor) &&
    ("value" in descriptor || "writable" in descriptor)
  )
    throw new TypeError(
      "Invalid property descriptor. Cannot both specify accessors and a value or writable attribute",
    )
  return descriptor
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.prototype.tostring
 */
export const object_to_string = create_builtin_function(
  function () {
    if (this === undefined) return "[object Undefined]"
    if (this === null) return "[object Null]"
    if (kind_of(this) === "array") return "[object Array]"
    return "[object Object]"
  },
  { name: "toString", length: 0 },
)

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-object-prototype-object
 */
define_builtin_properties(object_prototype, {
  constructor: Object,

  valueOf() {
    return this
  },

  toString: object_to_string,
})
