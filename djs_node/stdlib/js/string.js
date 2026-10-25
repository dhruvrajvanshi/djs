import {
  string_code_unit_at as unit,
  string_from_code_unit as character,
  string_slice,
  string_box,
  string_value,
  array_create,
  set_prototype,
  call,
} from "djs:intrinsics"
import {
  to_string,
  to_number,
  to_integer,
  to_length,
  relative_index,
  require_object_coercible,
  is_object,
  create_data_property,
} from "./abstract.js"
import Symbol, { descriptive_string } from "./symbol.js"
import { iterator_prototype } from "./iteration.js"

@builtin({ name: "String", prototype: "string", length: 1 })
class String {
  @internalMethod("Call")
  static #call(thisArgument, args) {
    if (args.length === 0) return ""
    if (typeof args[0] === "symbol") return descriptive_string(args[0])
    return to_string(args[0])
  }

  @internalMethod("Construct")
  static #construct(args, newTarget) {
    const text = args.length === 0 ? "" : to_string(args[0])
    const prototype = newTarget.prototype
    return string_box(text, is_object(prototype) ? prototype : String.prototype)
  }

  static fromCharCode(value) {
    let text = ""
    let index = 0
    while (index < arguments.length) {
      text = text + character(to_number(arguments[index]) & 65535)
      index = index + 1
    }
    return text
  }

  static fromCodePoint(value) {
    let text = ""
    let index = 0
    let point
    while (index < arguments.length) {
      point = to_number(arguments[index])
      if (point !== point || point < 0 || point > 1114111 || point % 1 !== 0)
        throw new RangeError("Invalid code point")
      text = text + point_string(point)
      index = index + 1
    }
    return text
  }

  static raw(template) {
    require_object_coercible(template)
    const raw = require_object_coercible(template.raw)
    const length = to_length(raw.length)
    let index = 0
    let text = ""
    while (index < length) {
      text = text + to_string(raw[index])
      if (index + 1 < length && index + 1 < arguments.length)
        text = text + to_string(arguments[index + 1])
      index = index + 1
    }
    return text
  }

  toString() {
    return string_value(this)
  }

  valueOf() {
    return string_value(this)
  }

  at(index) {
    const text = text_receiver(this)
    const relative = to_integer(index)
    const actual = relative < 0 ? text.length + relative : relative
    return actual < 0 || actual >= text.length
      ? undefined
      : character(unit(text, actual))
  }

  charAt(index) {
    const text = text_receiver(this)
    const actual = to_integer(index)
    return actual < 0 || actual >= text.length
      ? ""
      : character(unit(text, actual))
  }

  charCodeAt(index) {
    const text = text_receiver(this)
    const actual = to_integer(index)
    return actual < 0 || actual >= text.length ? NaN : unit(text, actual)
  }

  codePointAt(index) {
    const text = text_receiver(this)
    const actual = to_integer(index)
    if (actual < 0 || actual >= text.length) return undefined
    const first = unit(text, actual)
    if (first < 55296 || first > 56319 || actual + 1 === text.length)
      return first
    const second = unit(text, actual + 1)
    if (second < 56320 || second > 57343) return first
    return (first - 55296) * 1024 + second - 56320 + 65536
  }

  [Symbol.iterator]() {
    return string_iterator(text_receiver(this))
  }

  concat(value) {
    let text = text_receiver(this)
    let index = 0
    while (index < arguments.length) {
      text = text + to_string(arguments[index])
      index = index + 1
    }
    return text
  }

  slice(start, end) {
    const text = text_receiver(this)
    const first = relative_index(start, text.length)
    const last =
      end === undefined ? text.length : relative_index(end, text.length)
    return string_slice(text, first, last < first ? first : last)
  }

  substring(start, end) {
    const text = text_receiver(this)
    const first = clamp(start, text.length)
    const last = end === undefined ? text.length : clamp(end, text.length)
    return first < last
      ? string_slice(text, first, last)
      : string_slice(text, last, first)
  }

  indexOf(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    return find(text, needle, clamp(position, text.length))
  }

  lastIndexOf(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    const number = to_number(position)
    let index = number !== number ? text.length : clamp(number, text.length)
    if (index > text.length - needle.length) index = text.length - needle.length
    let offset
    while (index >= 0) {
      offset = 0
      while (
        offset < needle.length &&
        unit(text, index + offset) === unit(needle, offset)
      )
        offset = offset + 1
      if (offset === needle.length) return index
      index = index - 1
    }
    return -1
  }

  includes(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    return find(text, needle, clamp(position, text.length)) >= 0
  }

  startsWith(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    const start = clamp(position, text.length)
    if (start + needle.length > text.length) return false
    let index = 0
    while (index < needle.length) {
      if (unit(text, start + index) !== unit(needle, index)) return false
      index = index + 1
    }
    return true
  }

  endsWith(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    const end =
      position === undefined ? text.length : clamp(position, text.length)
    const start = end - needle.length
    if (start < 0) return false
    let index = 0
    while (index < needle.length) {
      if (unit(text, start + index) !== unit(needle, index)) return false
      index = index + 1
    }
    return true
  }

  repeat(count) {
    let text = text_receiver(this)
    let times = to_integer(count)
    if (times < 0 || times === Infinity || text.length * times > 4294967295)
      throw new RangeError("Invalid repeat count")
    if (text.length === 0) return ""
    let result = ""
    while (times > 0) {
      if (times % 2 !== 0) result = result + text
      times = (times - (times % 2)) / 2
      if (times > 0) text = text + text
    }
    return result
  }

  split(separator, limit) {
    const text = text_receiver(this)
    const maximum = limit === undefined ? 4294967295 : to_number(limit) >>> 0
    const needle = separator === undefined ? undefined : to_string(separator)
    const result = array_create(0)
    if (maximum === 0) return result
    if (needle === undefined) {
      create_data_property(result, 0, text)
      return result
    }
    let start = 0
    let count = 0
    let index
    if (needle.length === 0) {
      while (start < text.length && count < maximum) {
        create_data_property(result, count, character(unit(text, start)))
        start = start + 1
        count = count + 1
      }
      return result
    }
    index = find(text, needle, start)
    while (index >= 0 && count < maximum) {
      create_data_property(result, count, string_slice(text, start, index))
      count = count + 1
      start = index + needle.length
      index = find(text, needle, start)
    }
    if (count < maximum)
      create_data_property(
        result,
        count,
        string_slice(text, start, text.length),
      )
    return result
  }

  trim() {
    return trim(this, true, true)
  }

  trimStart() {
    return trim(this, true, false)
  }

  trimEnd() {
    return trim(this, false, true)
  }

  padStart(maximum, fill = undefined) {
    return pad(this, maximum, fill, true)
  }

  padEnd(maximum, fill = undefined) {
    return pad(this, maximum, fill, false)
  }

  replace(search, replacement) {
    return replace(this, search, replacement, false)
  }

  replaceAll(search, replacement) {
    return replace(this, search, replacement, true)
  }

  isWellFormed() {
    const text = text_receiver(this)
    let index = 0
    let first
    let second
    while (index < text.length) {
      first = unit(text, index)
      if (first >= 56320 && first <= 57343) return false
      if (first >= 55296 && first <= 56319) {
        if (index + 1 === text.length) return false
        second = unit(text, index + 1)
        if (second < 56320 || second > 57343) return false
        index = index + 1
      }
      index = index + 1
    }
    return true
  }

  toWellFormed() {
    const text = text_receiver(this)
    let result = ""
    let index = 0
    let first
    let second
    while (index < text.length) {
      first = unit(text, index)
      if (first >= 56320 && first <= 57343) result = result + "\ufffd"
      else if (first >= 55296 && first <= 56319) {
        second = index + 1 < text.length ? unit(text, index + 1) : 0
        if (second >= 56320 && second <= 57343) {
          result = result + character(first) + character(second)
          index = index + 1
        } else result = result + "\ufffd"
      } else result = result + character(first)
      index = index + 1
    }
    return result
  }
}

function string_iterator(text) {
  let index = 0
  const result = {
    next() {
      if (text === undefined) return { value: undefined, done: true }
      if (index >= text.length) {
        text = undefined
        return { value: undefined, done: true }
      }
      const first = unit(text, index)
      let size = 1
      if (first >= 55296 && first <= 56319 && index + 1 < text.length) {
        const second = unit(text, index + 1)
        if (second >= 56320 && second <= 57343) size = 2
      }
      const value = string_slice(text, index, index + size)
      index = index + size
      return { value, done: false }
    },
  }
  set_prototype(result, iterator_prototype)
  return result
}

function text_receiver(value) {
  return to_string(require_object_coercible(value))
}
function clamp(value, length) {
  const index = to_integer(value)
  return index < 0 ? 0 : index > length ? length : index
}
function find(text, search, start) {
  let index = start
  let offset
  while (index <= text.length - search.length) {
    offset = 0
    while (
      offset < search.length &&
      unit(text, index + offset) === unit(search, offset)
    )
      offset = offset + 1
    if (offset === search.length) return index
    index = index + 1
  }
  return -1
}
function point_string(point) {
  if (point < 65536) return character(point)
  const offset = point - 65536
  return (
    character(55296 + (offset - (offset % 1024)) / 1024) +
    character(56320 + (offset % 1024))
  )
}

function whitespace(code) {
  return (
    code === 9 ||
    code === 10 ||
    code === 11 ||
    code === 12 ||
    code === 13 ||
    code === 32 ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}
function trim(value, start, end) {
  const text = text_receiver(value)
  let first = 0
  let last = text.length
  if (start) {
    while (first < last && whitespace(unit(text, first))) first = first + 1
  }
  if (end) {
    while (last > first && whitespace(unit(text, last - 1))) last = last - 1
  }
  return string_slice(text, first, last)
}

function pad(value, maximum, fill, start) {
  const text = text_receiver(value)
  const length = to_length(maximum)
  if (length <= text.length) return text
  const filler = fill === undefined ? " " : to_string(fill)
  if (filler.length === 0) return text
  if (length > 4294967295) throw new RangeError("Invalid string length")
  const needed = length - text.length
  let padding = ""
  let chunk = filler
  let count = (needed - (needed % filler.length)) / filler.length
  while (count > 0) {
    if (count % 2 !== 0) padding = padding + chunk
    count = (count - (count % 2)) / 2
    if (count > 0) chunk = chunk + chunk
  }
  padding = padding + string_slice(filler, 0, needed % filler.length)
  return start ? padding + text : text + padding
}

function substitution(replacement, match, position, text) {
  let result = ""
  let index = 0
  let next
  while (index < replacement.length) {
    if (unit(replacement, index) === 36 && index + 1 < replacement.length) {
      next = unit(replacement, index + 1)
      if (next === 36) {
        result = result + "$"
        index = index + 2
      } else if (next === 38) {
        result = result + match
        index = index + 2
      } else if (next === 96) {
        result = result + string_slice(text, 0, position)
        index = index + 2
      } else if (next === 39) {
        result =
          result + string_slice(text, position + match.length, text.length)
        index = index + 2
      } else {
        result = result + character(unit(replacement, index))
        index = index + 1
      }
    } else {
      result = result + character(unit(replacement, index))
      index = index + 1
    }
  }
  return result
}
function replace(value, search, replacement, all) {
  const text = text_receiver(value)
  const needle = to_string(search)
  const functional = typeof replacement === "function"
  const template = functional ? undefined : to_string(replacement)
  let position = find(text, needle, 0)
  if (position < 0) return text
  let result = ""
  let end = 0
  let inserted
  while (position >= 0) {
    inserted = functional
      ? to_string(call(replacement, undefined, needle, position, text))
      : substitution(template, needle, position, text)
    result = result + string_slice(text, end, position) + inserted
    end = position + needle.length
    if (!all) return result + string_slice(text, end, text.length)
    position = find(
      text,
      needle,
      position + (needle.length === 0 ? 1 : needle.length),
    )
  }
  return result + string_slice(text, end, text.length)
}

export default String
