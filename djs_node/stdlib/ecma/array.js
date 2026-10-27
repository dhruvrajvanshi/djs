import {
  call,
  create_builtin_function,
  define_own_property,
  get_own_property,
  is_constructor,
  kind_of,
  object_create,
  ordinary_define_own_property,
  ordinary_delete,
  ordinary_own_property_keys,
  ordinary_set_prototype_of,
  string_code_unit_at,
  string_slice,
  set_internal_method,
  well_known_symbols,
  well_known_intrinsic_objects,
} from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"
import {
  to_object,
  to_length,
  to_integer_or_infinity,
  to_string,
  to_number,
  create_data_property_or_throw,
  get_prototype_from_constructor,
} from "./abstract-operations.js"
import { iterator_prototype } from "./iteration.js"
import { object_to_string } from "./object.js"
import { raw_array, raw_array_push } from "../raw/array.js"
import { raw_object } from "../raw/object.js"

const { "%Array.prototype%": array_prototype } = well_known_intrinsic_objects

const MAX_SAFE_INTEGER = 2 ** 53 - 1
const MAX_ARRAY_LENGTH = 2 ** 32 - 1

// The VM calls this whenever a property is defined on an array, including by
// assignment:
//
//   array[3] = "x"     // array_define_own_property.call(array, "3", …)
//   array.length = 0
//   Object.defineProperty(array, "0", { value: 1 })
set_internal_method("array", "[[DefineOwnProperty]]", array_define_own_property)

/**
 * https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array-constructor
 */
const Array = create_builtin_function(
  function (...values) {
    const prototype = get_prototype_from_constructor(
      new.target ?? Array,
      array_prototype,
    )
    if (values.length === 1 && typeof values[0] === "number")
      return array_create(values[0], prototype)
    const array = array_create(values.length, prototype)
    let index = 0
    while (index < values.length) {
      create_data_property_or_throw(array, index, values[index])
      index = index + 1
    }
    return array
  },
  { name: "Array", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/indexed-collections.html#sec-properties-of-the-array-constructor
 */
define_builtin_properties(Array, {
  isArray(value) {
    return kind_of(value) === "array"
  },

  of(...items) {
    const count = items.length
    const result = is_constructor(this) ? new this(count) : array_create(count)
    let index = 0
    while (index < count) {
      create_data_property_or_throw(result, index, items[index])
      index = index + 1
    }
    result.length = count
    return result
  },

  from(items, map = undefined, receiver = undefined) {
    if (map !== undefined) callable(map)
    if (typeof items === "string") {
      const result = is_constructor(this) ? new this() : array_create(0)
      let offset = 0
      let index = 0
      let value
      let first
      let second
      let width
      while (offset < items.length) {
        first = string_code_unit_at(items, offset)
        width = 1
        if (is_lead_surrogate(first) && offset + 1 < items.length) {
          second = string_code_unit_at(items, offset + 1)
          if (is_trail_surrogate(second)) width = 2
        }
        value = string_slice(items, offset, offset + width)
        if (map !== undefined) value = call(map, receiver, [value, index])
        create_data_property_or_throw(result, index, value)
        offset = offset + width
        index = index + 1
      }
      result.length = index
      return result
    }
    const object = to_object(items)
    const length = to_length(object.length)
    const result = is_constructor(this)
      ? new this(length)
      : array_create(length)
    let index = 0
    let value
    while (index < length) {
      value = object[index]
      if (map !== undefined) value = call(map, receiver, [value, index])
      create_data_property_or_throw(result, index, value)
      index = index + 1
    }
    result.length = length
    return result
  },
})
define_own_property(Array, "prototype", {
  value: array_prototype,
  writable: false,
  enumerable: false,
  configurable: false,
})

/**
 * https://tc39.es/ecma262/multipage/indexed-collections.html#sec-properties-of-the-array-prototype-object
 */
define_builtin_properties(array_prototype, {
  constructor: Array,

  at(index) {
    const object = to_object(this)
    const length = to_length(object.length)
    const offset = to_integer_or_infinity(index)
    const actual = offset < 0 ? length + offset : offset
    return actual < 0 || actual >= length ? undefined : object[actual]
  },

  push(...values) {
    const object = to_object(this)
    let length = to_length(object.length)
    check_length(length + values.length)
    let index = 0
    while (index < values.length) {
      object[length] = values[index]
      length = length + 1
      index = index + 1
    }
    object.length = length
    return length
  },

  pop() {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) {
      object.length = 0
      return undefined
    }
    const value = object[length - 1]
    delete object[length - 1]
    object.length = length - 1
    return value
  },

  shift() {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) {
      object.length = 0
      return undefined
    }
    const value = object[0]
    let index = 1
    while (index < length) {
      if (index in object) object[index - 1] = object[index]
      else delete object[index - 1]
      index = index + 1
    }
    delete object[length - 1]
    object.length = length - 1
    return value
  },

  unshift(...values) {
    const object = to_object(this)
    const length = to_length(object.length)
    const count = values.length
    check_length(length + count)
    let index = length
    while (count > 0 && index > 0) {
      if (index - 1 in object) object[index + count - 1] = object[index - 1]
      else delete object[index + count - 1]
      index = index - 1
    }
    index = 0
    while (index < count) {
      object[index] = values[index]
      index = index + 1
    }
    object.length = length + count
    return length + count
  },

  join(separator) {
    const object = to_object(this)
    const length = to_length(object.length)
    const delimiter = separator === undefined ? "," : to_string(separator)
    let active = joining
    while (active !== undefined) {
      if (active.object === object) return ""
      active = active.parent
    }
    const parent = joining
    joining = { object, parent }
    try {
      let text = ""
      let index = 0
      let value
      while (index < length) {
        if (index !== 0) text = text + delimiter
        value = object[index]
        if (value !== undefined && value !== null)
          text = text + to_string(value)
        index = index + 1
      }
      return text
    } finally {
      joining = parent
    }
  },

  toString() {
    const object = to_object(this)
    const join = object.join
    return typeof join === "function"
      ? call(join, object)
      : call(object_to_string, object)
  },

  slice(start, end) {
    const object = to_object(this)
    const length = to_length(object.length)
    let index = relative_index(start, length)
    const last = end === undefined ? length : relative_index(end, length)
    const count = last > index ? last - index : 0
    const result = array_create(count)
    let offset = 0
    while (index < last) {
      if (index in object)
        create_data_property_or_throw(result, offset, object[index])
      index = index + 1
      offset = offset + 1
    }
    return result
  },

  concat(...values) {
    const result = array_create(0)
    let offset = 0
    let argument = -1
    let item
    let index
    let length
    while (argument < values.length) {
      item = argument < 0 ? to_object(this) : values[argument]
      if (kind_of(item) === "array") {
        length = to_length(item.length)
        check_length(offset + length)
        index = 0
        while (index < length) {
          if (index in item)
            create_data_property_or_throw(result, offset, item[index])
          offset = offset + 1
          index = index + 1
        }
      } else {
        check_length(offset + 1)
        create_data_property_or_throw(result, offset, item)
        offset = offset + 1
      }
      argument = argument + 1
    }
    result.length = offset
    return result
  },

  reverse() {
    const object = to_object(this)
    const length = to_length(object.length)
    let lower = 0
    let upper = length - 1
    let lower_exists
    let upper_exists
    let lower_value
    let upper_value
    while (lower < upper) {
      lower_exists = lower in object
      if (lower_exists) lower_value = object[lower]
      upper_exists = upper in object
      if (upper_exists) upper_value = object[upper]
      if (upper_exists) object[lower] = upper_value
      else if (lower_exists) delete object[lower]
      if (lower_exists) object[upper] = lower_value
      else if (upper_exists) delete object[upper]
      lower = lower + 1
      upper = upper - 1
    }
    return object
  },

  fill(value, start = undefined, end = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    let index = relative_index(start, length)
    const last = end === undefined ? length : relative_index(end, length)
    while (index < last) {
      object[index] = value
      index = index + 1
    }
    return object
  },

  copyWithin(target, start, end = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    let to = relative_index(target, length)
    let from = relative_index(start, length)
    const last = end === undefined ? length : relative_index(end, length)
    let count = last - from < length - to ? last - from : length - to
    let direction = 1
    if (from < to && to < from + count) {
      direction = -1
      from = from + count - 1
      to = to + count - 1
    }
    while (count > 0) {
      if (from in object) object[to] = object[from]
      else delete object[to]
      from = from + direction
      to = to + direction
      count = count - 1
    }
    return object
  },

  splice(start, deleteCount, ...items) {
    const object = to_object(this)
    const length = to_length(object.length)
    const first = relative_index(start, length)
    let remove = arguments.length === 0 ? 0 : length - first
    if (arguments.length > 1) {
      remove = to_integer_or_infinity(deleteCount)
      if (remove < 0) remove = 0
      if (remove > length - first) remove = length - first
    }
    const insert = items.length
    check_length(length - remove + insert)
    const result = array_create(remove)
    let index = 0
    while (index < remove) {
      if (first + index in object)
        create_data_property_or_throw(result, index, object[first + index])
      index = index + 1
    }
    if (insert < remove) {
      index = first
      while (index < length - remove) {
        if (index + remove in object)
          object[index + insert] = object[index + remove]
        else delete object[index + insert]
        index = index + 1
      }
      index = length
      while (index > length - remove + insert) {
        delete object[index - 1]
        index = index - 1
      }
    } else if (insert > remove) {
      index = length - remove
      while (index > first) {
        if (index + remove - 1 in object)
          object[index + insert - 1] = object[index + remove - 1]
        else delete object[index + insert - 1]
        index = index - 1
      }
    }
    index = 0
    while (index < insert) {
      object[first + index] = items[index]
      index = index + 1
    }
    object.length = length - remove + insert
    return result
  },

  keys() {
    return iterator(this, 0)
  },

  values() {
    return iterator(this, 1)
  },

  entries() {
    return iterator(this, 2)
  },

  forEach(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (index in object) {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
      }
      index = index + 1
    }
    return undefined
  },

  map(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(length)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (index in object) {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        create_data_property_or_throw(result, index, selected)
      }
      index = index + 1
    }
    return result
  },

  filter(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(0)
    let offset = 0
    let index = 0
    let value
    let selected
    while (index < length) {
      if (index in object) {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) {
          create_data_property_or_throw(result, offset, value)
          offset = offset + 1
        }
      }
      index = index + 1
    }
    return result
  },

  some(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (index in object) {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) return true
      }
      index = index + 1
    }
    return false
  },

  every(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (index in object) {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (!selected) return false
      }
      index = index + 1
    }
    return true
  },

  find(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) return value
      }
      index = index + 1
    }
    return undefined
  },

  findIndex(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) return index
      }
      index = index + 1
    }
    return -1
  },

  findLast(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let value
    let selected
    while (index >= 0) {
      {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) return value
      }
      index = index - 1
    }
    return undefined
  },

  findLastIndex(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let value
    let selected
    while (index >= 0) {
      {
        value = object[index]
        selected = call(callback, receiver, [value, index, object])
        if (selected) return index
      }
      index = index - 1
    }
    return -1
  },

  reduce(callback, initial = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let accumulator = initial
    if (arguments.length < 2) {
      while (index < length && !(index in object)) {
        index = index + 1
      }
      if (!(index < length))
        throw new TypeError("Reduce of empty array without initial value")
      accumulator = object[index]
      index = index + 1
    }
    while (index < length) {
      if (index in object)
        accumulator = call(callback, undefined, [
          accumulator,
          object[index],
          index,
          object,
        ])
      index = index + 1
    }
    return accumulator
  },

  reduceRight(callback, initial = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let accumulator = initial
    if (arguments.length < 2) {
      while (index >= 0 && !(index in object)) {
        index = index - 1
      }
      if (!(index >= 0))
        throw new TypeError("Reduce of empty array without initial value")
      accumulator = object[index]
      index = index - 1
    }
    while (index >= 0) {
      if (index in object)
        accumulator = call(callback, undefined, [
          accumulator,
          object[index],
          index,
          object,
        ])
      index = index - 1
    }
    return accumulator
  },

  indexOf(search, fromIndex = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return -1
    const start = to_integer_or_infinity(fromIndex)
    let index = start < 0 ? length + start : start
    if (index < 0) index = 0
    let value
    while (index < length) {
      if (index in object && object[index] === search) return index
      index = index + 1
    }
    return -1
  },

  lastIndexOf(search, fromIndex = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return -1
    const start =
      arguments.length < 2 ? length - 1 : to_integer_or_infinity(fromIndex)
    let index = start < 0 ? length + start : start < length ? start : length - 1
    let value
    while (index >= 0) {
      if (index in object && object[index] === search) return index
      index = index - 1
    }
    return -1
  },

  includes(search, fromIndex = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return false
    const start = to_integer_or_infinity(fromIndex)
    let index = start < 0 ? length + start : start
    if (index < 0) index = 0
    let value
    while (index < length) {
      value = object[index]
      if (value === search || (value !== value && search !== search))
        return true
      index = index + 1
    }
    return false
  },

  sort(compare) {
    return sort_array(this, compare)
  },

  flat(depth = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    const limit = depth === undefined ? 1 : to_integer_or_infinity(depth)
    const result = array_create(0)
    flatten(result, object, length, limit, undefined, undefined, 0)
    return result
  },

  flatMap(callback, receiver = undefined) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(0)
    flatten(result, object, length, 1, callback, receiver, 0)
    return result
  },

  toReversed() {
    const object = to_object(this)
    const length = to_length(object.length)
    const result = array_create(length)
    let index = 0
    while (index < length) {
      create_data_property_or_throw(result, index, object[length - index - 1])
      index = index + 1
    }
    return result
  },

  ["with"](index, value) {
    const object = to_object(this)
    const length = to_length(object.length)
    const relative = to_integer_or_infinity(index)
    const actual = relative < 0 ? length + relative : relative
    if (actual < 0 || actual >= length)
      throw new RangeError("Invalid array index")
    const result = array_create(length)
    let offset = 0
    while (offset < length) {
      create_data_property_or_throw(
        result,
        offset,
        offset === actual ? value : object[offset],
      )
      offset = offset + 1
    }
    return result
  },

  toSorted(compare) {
    if (compare !== undefined) callable(compare)
    const object = to_object(this)
    const length = to_length(object.length)
    const result = array_create(length)
    let index = 0
    while (index < length) {
      create_data_property_or_throw(result, index, object[index])
      index = index + 1
    }
    return sort_array(result, compare)
  },

  toSpliced(start, deleteCount, ...items) {
    const object = to_object(this)
    const length = to_length(object.length)
    const first = relative_index(start, length)
    let remove = arguments.length === 0 ? 0 : length - first
    if (arguments.length > 1) {
      remove = to_integer_or_infinity(deleteCount)
      if (remove < 0) remove = 0
      if (remove > length - first) remove = length - first
    }
    const insert = items.length
    const count = length - remove + insert
    check_length(count)
    const result = array_create(count)
    let index = 0
    while (index < first) {
      create_data_property_or_throw(result, index, object[index])
      index = index + 1
    }
    let argument = 0
    while (argument < insert) {
      create_data_property_or_throw(result, index, items[argument])
      index = index + 1
      argument = argument + 1
    }
    let source = first + remove
    while (source < length) {
      create_data_property_or_throw(result, index, object[source])
      source = source + 1
      index = index + 1
    }
    return result
  },
})
/**
 * https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype-@@iterator
 */
define_own_property(array_prototype, well_known_symbols.iterator, {
  value: array_prototype.values,
  writable: true,
  enumerable: false,
  configurable: true,
})

/**
 * Arrays define their properties through this function, which keeps `length`
 * larger than every index:
 *
 *   const a = []
 *   a[3] = "x"    // a.length becomes 4
 *   a.length = 1  // deletes a[3]
 *
 * https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-array-exotic-objects-defineownproperty-p-desc
 */
function array_define_own_property(P, Desc) {
  const array = this
  if (P === "length") return array_set_length(array, Desc)
  const index = array_index(P)
  if (index < 0) return ordinary_define_own_property(array, P, Desc)
  const length = get_own_property(array, "length")
  if (index >= length.value && !length.writable) return false
  if (!ordinary_define_own_property(array, P, Desc)) return false
  if (index >= length.value)
    return ordinary_define_own_property(array, "length", { value: index + 1 })
  return true
}

/**
 * https://tc39.es/ecma262/multipage/indexed-collections.html#sec-arraycreate
 */
function array_create(length, proto = array_prototype) {
  if (length < 0 || length > MAX_ARRAY_LENGTH || length % 1 !== 0)
    throw new RangeError("Invalid array length")
  const array = object_create(proto, "array")
  ordinary_define_own_property(array, "length", { value: length })
  return array
}

// Turns an index that counts from the end when negative into one between 0
// and `length`: relative_index(-1, 5) is 4, relative_index(-10, 5) is 0, and
// relative_index(9, 5) is 5.
function relative_index(value, length) {
  const index = to_integer_or_infinity(value)
  if (index < 0) return index < -length ? 0 : length + index
  return index > length ? length : index
}

function is_lead_surrogate(code) {
  return code >= 0xd800 && code <= 0xdbff
}

function is_trail_surrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff
}

function callable(value) {
  if (typeof value !== "function")
    throw new TypeError("Callback is not callable")
  return value
}

function check_length(length) {
  if (length > MAX_SAFE_INTEGER)
    throw new TypeError("Array-like length exceeds maximum")
}

function array_index(key) {
  if (typeof key === "symbol") return -1
  const index = +key
  if (
    index < 0 ||
    index >= MAX_ARRAY_LENGTH ||
    index % 1 !== 0 ||
    to_string(index) !== key
  )
    return -1
  return index
}

function copy_descriptor(descriptor) {
  const copy = raw_object()
  if ("value" in descriptor) copy.value = descriptor.value
  if ("writable" in descriptor) copy.writable = descriptor.writable
  if ("enumerable" in descriptor) copy.enumerable = descriptor.enumerable
  if ("configurable" in descriptor) copy.configurable = descriptor.configurable
  if ("get" in descriptor) copy.get = descriptor.get
  if ("set" in descriptor) copy.set = descriptor.set
  return copy
}

function array_set_length(array, descriptor) {
  if (!("value" in descriptor))
    return ordinary_define_own_property(array, "length", descriptor)
  const next = copy_descriptor(descriptor)
  const value = next.value
  const length = to_number(value) >>> 0
  if (length !== to_number(value)) throw new RangeError("Invalid array length")
  next.value = length
  const previous = get_own_property(array, "length")
  if (length >= previous.value)
    return ordinary_define_own_property(array, "length", next)
  if (!previous.writable) return false
  const writable = !("writable" in next) || !!next.writable
  if (!writable) next.writable = true
  if (!ordinary_define_own_property(array, "length", next)) return false
  // Enumerating existing keys avoids walking billions of holes in sparse arrays.
  const keys = ordinary_own_property_keys(array)
  let offset = keys.length - 1
  let key
  let index
  while (offset >= 0) {
    key = keys[offset]
    index = array_index(key)
    if (index >= length) {
      if (!ordinary_delete(array, key)) {
        next.value = index + 1
        if (!writable) next.writable = false
        ordinary_define_own_property(array, "length", next)
        return false
      }
    }
    offset = offset - 1
  }
  if (!writable)
    return ordinary_define_own_property(array, "length", { writable: false })
  return true
}

function iterator(object, kind) {
  let target = to_object(object)
  let index = 0
  const result = {
    next() {
      if (target === undefined) return { value: undefined, done: true }
      if (index >= to_length(target.length)) {
        target = undefined
        return { value: undefined, done: true }
      }
      const current = index
      index = index + 1
      return {
        value:
          kind === 0
            ? current
            : kind === 1
              ? target[current]
              : [current, target[current]],
        done: false,
      }
    },
  }
  ordinary_set_prototype_of(result, iterator_prototype)
  return result
}

let joining

function sort_compare(compare, left, right) {
  if (left === undefined) return right === undefined ? 0 : 1
  if (right === undefined) return -1
  if (compare !== undefined) {
    const result = +call(compare, undefined, [left, right])
    return result !== result ? 0 : result
  }
  const a = to_string(left)
  const b = to_string(right)
  return a < b ? -1 : a > b ? 1 : 0
}

function sort_array(receiver, compare) {
  if (compare !== undefined) callable(compare)
  const object = to_object(receiver)
  const length = to_length(object.length)
  let values = raw_array()
  let index = 0
  while (index < length) {
    if (index in object) raw_array_push(values, object[index])
    index = index + 1
  }
  const count = values.length
  let width = 1
  let next
  let start
  let middle
  let end
  let left
  let right
  let out
  while (width < count) {
    next = raw_array()
    start = 0
    while (start < count) {
      middle = start + width < count ? start + width : count
      end = start + width * 2 < count ? start + width * 2 : count
      left = start
      right = middle
      out = start
      while (out < end) {
        if (
          left < middle &&
          (right >= end ||
            sort_compare(compare, values[left], values[right]) <= 0)
        ) {
          raw_array_push(next, values[left])
          left = left + 1
        } else {
          raw_array_push(next, values[right])
          right = right + 1
        }
        out = out + 1
      }
      start = end
    }
    values = next
    width = width * 2
  }
  index = 0
  while (index < count) {
    object[index] = values[index]
    index = index + 1
  }
  while (index < length) {
    delete object[index]
    index = index + 1
  }
  return object
}

function flatten(target, source, length, depth, mapper, receiver, offset) {
  let index = 0
  let element
  while (index < length) {
    if (index in source) {
      element = source[index]
      if (mapper !== undefined)
        element = call(mapper, receiver, [element, index, source])
      if (depth > 0 && kind_of(element) === "array")
        offset = flatten(
          target,
          element,
          to_length(element.length),
          depth - 1,
          undefined,
          undefined,
          offset,
        )
      else {
        check_length(offset + 1)
        create_data_property_or_throw(target, offset, element)
        offset = offset + 1
      }
    }
    index = index + 1
  }
  return offset
}

export default Array
