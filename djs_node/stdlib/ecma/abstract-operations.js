import {
  call,
  define_own_property,
  get_own_property,
  object_create,
  ordinary_own_property_keys,
  set_abstract_operation,
  well_known_intrinsic_objects,
} from "djs:vm"

const { "%String.prototype%": string_prototype } = well_known_intrinsic_objects

const MAX_SAFE_INTEGER = 2 ** 53 - 1

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

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toprimitive
 */
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
// The VM calls this when an operator meets an object:
//
//   object + 1, object == 1              // no hint
//   object < 1, object * 2, -object      // hint "number"
//   `${object}`, o[object], object in o  // hint "string"
set_abstract_operation("ToPrimitive", to_primitive)

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tostring
 */
export function to_string(value) {
  return "" + to_primitive(value, "string")
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber
 */
export function to_number(value) {
  return +to_primitive(value, "number")
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toobject
 */
export function to_object(value) {
  require_object_coercible(value)
  if (typeof value === "string")
    return object_create(string_prototype, "string", {
      "[[StringData]]": value,
    })
  if (is_object(value)) return value
  return {}
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-topropertykey
 */
export function to_property_key(value) {
  const key = to_primitive(value, "string")
  if (typeof key === "symbol") return key
  return to_string(key)
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tointegerorinfinity
 */
export function to_integer_or_infinity(value) {
  const number = to_number(value)
  if (number !== number || number === 0) return 0
  if (number === Infinity || number === -Infinity) return number
  return number - (number % 1)
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tolength
 */
export function to_length(value) {
  const length = to_integer_or_infinity(value)
  if (length <= 0) return 0
  return length > MAX_SAFE_INTEGER ? MAX_SAFE_INTEGER : length
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-definepropertyorthrow
 */
export function define_property_or_throw(object, key, descriptor) {
  if (!define_own_property(object, key, descriptor))
    throw new TypeError("Cannot redefine property")
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-createdatapropertyorthrow
 */
export function create_data_property_or_throw(object, key, value) {
  define_property_or_throw(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-createnonenumerabledatapropertyorthrow
 */
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

/**
 * https://tc39.es/ecma262/multipage/abstract-operations.html#sec-copydataproperties
 */
export function copy_data_properties(target, source) {
  if (source === null || source === undefined) return target
  const from = to_object(source)
  const keys = ordinary_own_property_keys(from)
  let index = 0
  while (index < keys.length) {
    const key = keys[index]
    const descriptor = get_own_property(from, key)
    if (descriptor !== undefined && descriptor.enumerable)
      create_data_property_or_throw(target, key, from[key])
    index = index + 1
  }
  return target
}
// The VM calls this for object spread:
//
//   { a: 1, ...source }  // copy_data_properties({ a: 1 }, source)
set_abstract_operation("CopyDataProperties", copy_data_properties)

/**
 * https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-getprototypefromconstructor
 */
export function get_prototype_from_constructor(constructor, default_prototype) {
  const prototype = constructor.prototype
  return is_object(prototype) ? prototype : default_prototype
}
