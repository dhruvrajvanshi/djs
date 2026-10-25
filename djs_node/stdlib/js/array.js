import {
  array_create,
  is_array,
  is_constructor,
  call,
  has_property,
  delete_property,
  define_property,
  string_code_unit_at,
  string_slice,
} from "djs:intrinsics"
import {
  to_object,
  to_length,
  to_integer,
  relative_index,
  callable,
  to_string,
  is_object,
  create_data_property,
  method,
  check_length,
  object_prototype,
} from "./abstract.js"

function Array() {
  let prototype = array_prototype
  if (new.target !== undefined) {
    const candidate = new.target.prototype
    if (is_object(candidate)) prototype = candidate
  }
  const count = arguments.length
  if (count === 1 && typeof arguments[0] === "number")
    return array_create(arguments[0], prototype)
  const result = array_create(count, prototype)
  let index = 0
  while (index < count) {
    create_data_property(result, index, arguments[index])
    index = index + 1
  }
  return result
}

const array_prototype = array_create(0, object_prototype)
define_property(Array, "prototype", { value: array_prototype })
define_property(array_prototype, "constructor", {
  value: Array,
  writable: true,
  configurable: true,
})
define_property(Array, "name", { value: "Array", configurable: true })
define_property(Array, "length", { value: 1, configurable: true })

const statics = {
  isArray(value) {
    return is_array(value)
  },
  of() {
    const count = arguments.length
    const result = is_constructor(this) ? new this(count) : array_create(count)
    let index = 0
    while (index < count) {
      create_data_property(result, index, arguments[index])
      index = index + 1
    }
    result.length = count
    return result
  },
  from(items, map, receiver) {
    if (map !== undefined) callable(map)
    // String iteration yields code points rather than individual code units.
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
        if (first >= 55296 && first <= 56319 && offset + 1 < items.length) {
          second = string_code_unit_at(items, offset + 1)
          if (second >= 56320 && second <= 57343) width = 2
        }
        value = string_slice(items, offset, offset + width)
        if (map !== undefined) value = call(map, receiver, value, index)
        create_data_property(result, index, value)
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
      if (map !== undefined) value = call(map, receiver, value, index)
      create_data_property(result, index, value)
      index = index + 1
    }
    result.length = length
    return result
  },
}
method(Array, "isArray", statics.isArray, 1)
method(Array, "of", statics.of, 0)
method(Array, "from", statics.from, 1)

function iterator(object, kind) {
  let target = to_object(object)
  let index = 0
  return {
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
}

// A linked stack avoids recursively joining arrays that contain themselves.
let joining
const methods = {
  at(index) {
    const object = to_object(this)
    const length = to_length(object.length)
    const offset = to_integer(index)
    const actual = offset < 0 ? length + offset : offset
    return actual < 0 || actual >= length ? undefined : object[actual]
  },
  push() {
    const object = to_object(this)
    let length = to_length(object.length)
    check_length(length + arguments.length)
    let index = 0
    while (index < arguments.length) {
      object[length] = arguments[index]
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
    delete_property(object, length - 1)
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
      if (has_property(object, index)) object[index - 1] = object[index]
      else delete_property(object, index - 1)
      index = index + 1
    }
    delete_property(object, length - 1)
    object.length = length - 1
    return value
  },
  unshift() {
    const object = to_object(this)
    const length = to_length(object.length)
    const count = arguments.length
    check_length(length + count)
    let index = length
    while (count > 0 && index > 0) {
      if (has_property(object, index - 1))
        object[index + count - 1] = object[index - 1]
      else delete_property(object, index + count - 1)
      index = index - 1
    }
    index = 0
    while (index < count) {
      object[index] = arguments[index]
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
      : call(object_prototype.toString, object)
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
      if (has_property(object, index))
        create_data_property(result, offset, object[index])
      index = index + 1
      offset = offset + 1
    }
    return result
  },
  concat() {
    const result = array_create(0)
    let offset = 0
    let argument = -1
    let item
    let index
    let length
    while (argument < arguments.length) {
      item = argument < 0 ? to_object(this) : arguments[argument]
      if (is_array(item)) {
        length = to_length(item.length)
        check_length(offset + length)
        index = 0
        while (index < length) {
          if (has_property(item, index))
            create_data_property(result, offset, item[index])
          offset = offset + 1
          index = index + 1
        }
      } else {
        check_length(offset + 1)
        create_data_property(result, offset, item)
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
      lower_exists = has_property(object, lower)
      if (lower_exists) lower_value = object[lower]
      upper_exists = has_property(object, upper)
      if (upper_exists) upper_value = object[upper]
      if (upper_exists) object[lower] = upper_value
      else if (lower_exists) delete_property(object, lower)
      if (lower_exists) object[upper] = lower_value
      else if (upper_exists) delete_property(object, upper)
      lower = lower + 1
      upper = upper - 1
    }
    return object
  },
  fill(value, start, end) {
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
  copyWithin(target, start, end) {
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
      if (has_property(object, from)) object[to] = object[from]
      else delete_property(object, to)
      from = from + direction
      to = to + direction
      count = count - 1
    }
    return object
  },
  splice(start, deleteCount) {
    const object = to_object(this)
    const length = to_length(object.length)
    const first = relative_index(start, length)
    let remove = arguments.length === 0 ? 0 : length - first
    if (arguments.length > 1) {
      remove = to_integer(deleteCount)
      if (remove < 0) remove = 0
      if (remove > length - first) remove = length - first
    }
    const insert = arguments.length > 2 ? arguments.length - 2 : 0
    check_length(length - remove + insert)
    const result = array_create(remove)
    let index = 0
    while (index < remove) {
      if (has_property(object, first + index))
        create_data_property(result, index, object[first + index])
      index = index + 1
    }
    if (insert < remove) {
      index = first
      while (index < length - remove) {
        if (has_property(object, index + remove))
          object[index + insert] = object[index + remove]
        else delete_property(object, index + insert)
        index = index + 1
      }
      index = length
      while (index > length - remove + insert) {
        delete_property(object, index - 1)
        index = index - 1
      }
    } else if (insert > remove) {
      index = length - remove
      while (index > first) {
        if (has_property(object, index + remove - 1))
          object[index + insert - 1] = object[index + remove - 1]
        else delete_property(object, index + insert - 1)
        index = index - 1
      }
    }
    index = 0
    while (index < insert) {
      object[first + index] = arguments[index + 2]
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
}

methods.forEach = {
  forEach(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (has_property(object, index)) {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
      }
      index = index + 1
    }
    return undefined
  },
}.forEach

methods.map = {
  map(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(length)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (has_property(object, index)) {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        create_data_property(result, index, selected)
      }
      index = index + 1
    }
    return result
  },
}.map

methods.filter = {
  filter(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(0)
    let offset = 0
    let index = 0
    let value
    let selected
    while (index < length) {
      if (has_property(object, index)) {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) {
          create_data_property(result, offset, value)
          offset = offset + 1
        }
      }
      index = index + 1
    }
    return result
  },
}.filter

methods.some = {
  some(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (has_property(object, index)) {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) return true
      }
      index = index + 1
    }
    return false
  },
}.some

methods.every = {
  every(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      if (has_property(object, index)) {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (!selected) return false
      }
      index = index + 1
    }
    return true
  },
}.every

methods.find = {
  find(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) return value
      }
      index = index + 1
    }
    return undefined
  },
}.find

methods.findIndex = {
  findIndex(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let value
    let selected
    while (index < length) {
      {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) return index
      }
      index = index + 1
    }
    return -1
  },
}.findIndex

methods.findLast = {
  findLast(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let value
    let selected
    while (index >= 0) {
      {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) return value
      }
      index = index - 1
    }
    return undefined
  },
}.findLast

methods.findLastIndex = {
  findLastIndex(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let value
    let selected
    while (index >= 0) {
      {
        value = object[index]
        selected = call(callback, receiver, value, index, object)
        if (selected) return index
      }
      index = index - 1
    }
    return -1
  },
}.findLastIndex

methods.reduce = {
  reduce(callback, initial) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = 0
    let accumulator = initial
    if (arguments.length < 2) {
      while (index < length && !has_property(object, index)) {
        index = index + 1
      }
      if (!(index < length))
        throw new TypeError("Reduce of empty array without initial value")
      accumulator = object[index]
      index = index + 1
    }
    while (index < length) {
      if (has_property(object, index))
        accumulator = call(
          callback,
          undefined,
          accumulator,
          object[index],
          index,
          object,
        )
      index = index + 1
    }
    return accumulator
  },
}.reduce

methods.reduceRight = {
  reduceRight(callback, initial) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    let index = length - 1
    let accumulator = initial
    if (arguments.length < 2) {
      while (index >= 0 && !has_property(object, index)) {
        index = index - 1
      }
      if (!(index >= 0))
        throw new TypeError("Reduce of empty array without initial value")
      accumulator = object[index]
      index = index - 1
    }
    while (index >= 0) {
      if (has_property(object, index))
        accumulator = call(
          callback,
          undefined,
          accumulator,
          object[index],
          index,
          object,
        )
      index = index - 1
    }
    return accumulator
  },
}.reduceRight

methods.indexOf = {
  indexOf(search, fromIndex) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return -1
    const start = to_integer(fromIndex)
    let index = start < 0 ? length + start : start
    if (index < 0) index = 0
    let value
    while (index < length) {
      if (has_property(object, index) && object[index] === search) return index
      index = index + 1
    }
    return -1
  },
}.indexOf

methods.lastIndexOf = {
  lastIndexOf(search, fromIndex) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return -1
    const start = arguments.length < 2 ? length - 1 : to_integer(fromIndex)
    let index = start < 0 ? length + start : start < length ? start : length - 1
    let value
    while (index >= 0) {
      if (has_property(object, index) && object[index] === search) return index
      index = index - 1
    }
    return -1
  },
}.lastIndexOf

methods.includes = {
  includes(search, fromIndex) {
    const object = to_object(this)
    const length = to_length(object.length)
    if (length === 0) return false
    const start = to_integer(fromIndex)
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
}.includes

function sort_compare(compare, left, right) {
  if (left === undefined) return right === undefined ? 0 : 1
  if (right === undefined) return -1
  if (compare !== undefined) {
    const result = +call(compare, undefined, left, right)
    return result !== result ? 0 : result
  }
  const a = to_string(left)
  const b = to_string(right)
  return a < b ? -1 : a > b ? 1 : 0
}

// Bottom-up merge sort is stable and keeps comparisons in the stdlib.
methods.sort = {
  sort(compare) {
    if (compare !== undefined) callable(compare)
    const object = to_object(this)
    const length = to_length(object.length)
    let values = array_create(0)
    let index = 0
    let count = 0
    while (index < length) {
      if (has_property(object, index)) {
        create_data_property(values, count, object[index])
        count = count + 1
      }
      index = index + 1
    }
    let width = 1
    let next
    let start
    let middle
    let end
    let left
    let right
    let out
    while (width < count) {
      next = array_create(count)
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
            create_data_property(next, out, values[left])
            left = left + 1
          } else {
            create_data_property(next, out, values[right])
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
      delete_property(object, index)
      index = index + 1
    }
    return object
  },
}.sort

function flatten(target, source, length, depth, mapper, receiver, offset) {
  let index = 0
  let element
  while (index < length) {
    if (has_property(source, index)) {
      element = source[index]
      if (mapper !== undefined)
        element = call(mapper, receiver, element, index, source)
      if (depth > 0 && is_array(element))
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
        create_data_property(target, offset, element)
        offset = offset + 1
      }
    }
    index = index + 1
  }
  return offset
}
methods.flat = {
  flat(depth) {
    const object = to_object(this)
    const length = to_length(object.length)
    const limit = depth === undefined ? 1 : to_integer(depth)
    const result = array_create(0)
    flatten(result, object, length, limit, undefined, undefined, 0)
    return result
  },
}.flat
methods.flatMap = {
  flatMap(callback, receiver) {
    const object = to_object(this)
    const length = to_length(object.length)
    callable(callback)
    const result = array_create(0)
    flatten(result, object, length, 1, callback, receiver, 0)
    return result
  },
}.flatMap
methods.toReversed = {
  toReversed() {
    const object = to_object(this)
    const length = to_length(object.length)
    const result = array_create(length)
    let index = 0
    while (index < length) {
      create_data_property(result, index, object[length - index - 1])
      index = index + 1
    }
    return result
  },
}.toReversed
methods.with = {
  withValue(index, value) {
    const object = to_object(this)
    const length = to_length(object.length)
    const relative = to_integer(index)
    const actual = relative < 0 ? length + relative : relative
    if (actual < 0 || actual >= length)
      throw new RangeError("Invalid array index")
    const result = array_create(length)
    let offset = 0
    while (offset < length) {
      create_data_property(
        result,
        offset,
        offset === actual ? value : object[offset],
      )
      offset = offset + 1
    }
    return result
  },
}.withValue
methods.toSorted = {
  toSorted(compare) {
    if (compare !== undefined) callable(compare)
    const object = to_object(this)
    const length = to_length(object.length)
    const result = array_create(length)
    let index = 0
    while (index < length) {
      create_data_property(result, index, object[index])
      index = index + 1
    }
    return call(methods.sort, result, compare)
  },
}.toSorted
methods.toSpliced = {
  toSpliced(start, deleteCount) {
    const object = to_object(this)
    const length = to_length(object.length)
    const first = relative_index(start, length)
    let remove = arguments.length === 0 ? 0 : length - first
    if (arguments.length > 1) {
      remove = to_integer(deleteCount)
      if (remove < 0) remove = 0
      if (remove > length - first) remove = length - first
    }
    const insert = arguments.length > 2 ? arguments.length - 2 : 0
    const count = length - remove + insert
    check_length(count)
    const result = array_create(count)
    let index = 0
    while (index < first) {
      create_data_property(result, index, object[index])
      index = index + 1
    }
    let argument = 0
    while (argument < insert) {
      create_data_property(result, index, arguments[argument + 2])
      index = index + 1
      argument = argument + 1
    }
    let source = first + remove
    while (source < length) {
      create_data_property(result, index, object[source])
      source = source + 1
      index = index + 1
    }
    return result
  },
}.toSpliced

method(array_prototype, "at", methods.at, 1)
method(array_prototype, "push", methods.push, 1)
method(array_prototype, "pop", methods.pop, 0)
method(array_prototype, "shift", methods.shift, 0)
method(array_prototype, "unshift", methods.unshift, 1)
method(array_prototype, "join", methods.join, 1)
method(array_prototype, "toString", methods.toString, 0)
method(array_prototype, "slice", methods.slice, 2)
method(array_prototype, "concat", methods.concat, 1)
method(array_prototype, "reverse", methods.reverse, 0)
method(array_prototype, "fill", methods.fill, 1)
method(array_prototype, "copyWithin", methods.copyWithin, 2)
method(array_prototype, "splice", methods.splice, 2)
method(array_prototype, "keys", methods.keys, 0)
method(array_prototype, "values", methods.values, 0)
method(array_prototype, "entries", methods.entries, 0)
method(array_prototype, "forEach", methods.forEach, 1)
method(array_prototype, "map", methods.map, 1)
method(array_prototype, "filter", methods.filter, 1)
method(array_prototype, "some", methods.some, 1)
method(array_prototype, "every", methods.every, 1)
method(array_prototype, "find", methods.find, 1)
method(array_prototype, "findIndex", methods.findIndex, 1)
method(array_prototype, "findLast", methods.findLast, 1)
method(array_prototype, "findLastIndex", methods.findLastIndex, 1)
method(array_prototype, "reduce", methods.reduce, 1)
method(array_prototype, "reduceRight", methods.reduceRight, 1)
method(array_prototype, "indexOf", methods.indexOf, 1)
method(array_prototype, "lastIndexOf", methods.lastIndexOf, 1)
method(array_prototype, "includes", methods.includes, 1)
method(array_prototype, "sort", methods.sort, 1)
method(array_prototype, "flat", methods.flat, 0)
method(array_prototype, "flatMap", methods.flatMap, 1)
method(array_prototype, "toReversed", methods.toReversed, 0)
method(array_prototype, "with", methods.with, 2)
method(array_prototype, "toSorted", methods.toSorted, 1)
method(array_prototype, "toSpliced", methods.toSpliced, 2)

export default Array
