import {
  call,
  create_builtin_function,
  define_own_property,
  get_slot,
  has_slot,
  object_create,
  ordinary_set_prototype_of,
  string_code_unit_at as unit,
  string_from_code_unit as character,
  string_slice,
  well_known_symbols,
  well_known_intrinsic_objects,
} from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"
import {
  to_string,
  to_number,
  to_integer_or_infinity,
  to_length,
  require_object_coercible,
  create_data_property_or_throw,
  get_prototype_from_constructor,
} from "./abstract-operations.js"
import { descriptive_string } from "./symbol.js"
import { iterator_prototype } from "./iteration.js"

const { "%String.prototype%": string_prototype } = well_known_intrinsic_objects

const MAX_STRING_LENGTH = 2 ** 32 - 1

/**
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-string-constructor
 */
const String = create_builtin_function(
  function (value) {
    let text = ""
    if (arguments.length !== 0)
      text =
        new.target === undefined && typeof value === "symbol"
          ? descriptive_string(value)
          : to_string(value)
    if (new.target === undefined) return text
    return object_create(
      get_prototype_from_constructor(new.target, string_prototype),
      "string",
      { "[[StringData]]": text },
    )
  },
  { name: "String", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-properties-of-the-string-constructor
 */
define_builtin_properties(String, {
  fromCharCode(...code_units) {
    let text = ""
    let index = 0
    while (index < code_units.length) {
      text = text + character(to_number(code_units[index]) & 0xffff)
      index = index + 1
    }
    return text
  },

  fromCodePoint(...code_points) {
    let text = ""
    let index = 0
    let point
    while (index < code_points.length) {
      point = to_number(code_points[index])
      if (point !== point || point < 0 || point > 0x10ffff || point % 1 !== 0)
        throw new RangeError("Invalid code point")
      text = text + point_string(point)
      index = index + 1
    }
    return text
  },

  raw(template, ...substitutions) {
    require_object_coercible(template)
    const raw = require_object_coercible(template.raw)
    const length = to_length(raw.length)
    let index = 0
    let text = ""
    while (index < length) {
      text = text + to_string(raw[index])
      if (index + 1 < length && index < substitutions.length)
        text = text + to_string(substitutions[index])
      index = index + 1
    }
    return text
  },
})
define_own_property(String, "prototype", {
  value: string_prototype,
  writable: false,
  enumerable: false,
  configurable: false,
})

/**
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-properties-of-the-string-prototype-object
 */
define_builtin_properties(string_prototype, {
  constructor: String,

  toString() {
    return this_string_value(this)
  },

  valueOf() {
    return this_string_value(this)
  },

  at(index) {
    const text = text_receiver(this)
    const relative = to_integer_or_infinity(index)
    const actual = relative < 0 ? text.length + relative : relative
    return actual < 0 || actual >= text.length
      ? undefined
      : character(unit(text, actual))
  },

  charAt(index) {
    const text = text_receiver(this)
    const actual = to_integer_or_infinity(index)
    return actual < 0 || actual >= text.length
      ? ""
      : character(unit(text, actual))
  },

  charCodeAt(index) {
    const text = text_receiver(this)
    const actual = to_integer_or_infinity(index)
    return actual < 0 || actual >= text.length ? NaN : unit(text, actual)
  },

  codePointAt(index) {
    const text = text_receiver(this)
    const actual = to_integer_or_infinity(index)
    if (actual < 0 || actual >= text.length) return undefined
    const first = unit(text, actual)
    if (!is_lead_surrogate(first) || actual + 1 === text.length) return first
    const second = unit(text, actual + 1)
    if (!is_trail_surrogate(second)) return first
    return (first - 0xd800) * 0x400 + (second - 0xdc00) + 0x10000
  },

  [well_known_symbols.iterator]() {
    return string_iterator(text_receiver(this))
  },

  concat(...values) {
    let text = text_receiver(this)
    let index = 0
    while (index < values.length) {
      text = text + to_string(values[index])
      index = index + 1
    }
    return text
  },

  slice(start, end) {
    const text = text_receiver(this)
    const first = relative_index(start, text.length)
    const last =
      end === undefined ? text.length : relative_index(end, text.length)
    return string_slice(text, first, last < first ? first : last)
  },

  substring(start, end) {
    const text = text_receiver(this)
    const first = clamp(start, text.length)
    const last = end === undefined ? text.length : clamp(end, text.length)
    return first < last
      ? string_slice(text, first, last)
      : string_slice(text, last, first)
  },

  indexOf(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    return find(text, needle, clamp(position, text.length))
  },

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
  },

  includes(search, position = undefined) {
    const text = text_receiver(this)
    const needle = to_string(search)
    return find(text, needle, clamp(position, text.length)) >= 0
  },

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
  },

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
  },

  repeat(count) {
    let text = text_receiver(this)
    let times = to_integer_or_infinity(count)
    if (
      times < 0 ||
      times === Infinity ||
      text.length * times > MAX_STRING_LENGTH
    )
      throw new RangeError("Invalid repeat count")
    if (text.length === 0) return ""
    let result = ""
    while (times > 0) {
      if (times % 2 !== 0) result = result + text
      times = (times - (times % 2)) / 2
      if (times > 0) text = text + text
    }
    return result
  },

  split(separator, limit) {
    const text = text_receiver(this)
    const maximum = limit === undefined ? 2 ** 32 - 1 : to_number(limit) >>> 0
    const needle = separator === undefined ? undefined : to_string(separator)
    const result = []
    if (maximum === 0) return result
    if (needle === undefined) {
      create_data_property_or_throw(result, 0, text)
      return result
    }
    let start = 0
    let count = 0
    let index
    if (needle.length === 0) {
      while (start < text.length && count < maximum) {
        create_data_property_or_throw(
          result,
          count,
          character(unit(text, start)),
        )
        start = start + 1
        count = count + 1
      }
      return result
    }
    index = find(text, needle, start)
    while (index >= 0 && count < maximum) {
      create_data_property_or_throw(
        result,
        count,
        string_slice(text, start, index),
      )
      count = count + 1
      start = index + needle.length
      index = find(text, needle, start)
    }
    if (count < maximum)
      create_data_property_or_throw(
        result,
        count,
        string_slice(text, start, text.length),
      )
    return result
  },

  trim() {
    return trim(this, true, true)
  },

  trimStart() {
    return trim(this, true, false)
  },

  trimEnd() {
    return trim(this, false, true)
  },

  padStart(maximum, fill = undefined) {
    return pad(this, maximum, fill, true)
  },

  padEnd(maximum, fill = undefined) {
    return pad(this, maximum, fill, false)
  },

  replace(search, replacement) {
    return replace(this, search, replacement, false)
  },

  replaceAll(search, replacement) {
    return replace(this, search, replacement, true)
  },

  isWellFormed() {
    const text = text_receiver(this)
    let index = 0
    let first
    let second
    while (index < text.length) {
      first = unit(text, index)
      if (is_trail_surrogate(first)) return false
      if (is_lead_surrogate(first)) {
        if (index + 1 === text.length) return false
        second = unit(text, index + 1)
        if (!is_trail_surrogate(second)) return false
        index = index + 1
      }
      index = index + 1
    }
    return true
  },

  toWellFormed() {
    const text = text_receiver(this)
    let result = ""
    let index = 0
    let first
    let second
    while (index < text.length) {
      first = unit(text, index)
      if (is_trail_surrogate(first)) result = result + "\ufffd"
      else if (is_lead_surrogate(first)) {
        second = index + 1 < text.length ? unit(text, index + 1) : 0
        if (is_trail_surrogate(second)) {
          result = result + character(first) + character(second)
          index = index + 1
        } else result = result + "\ufffd"
      } else result = result + character(first)
      index = index + 1
    }
    return result
  },
})

/**
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-thisstringvalue
 */
function this_string_value(value) {
  if (typeof value === "string") return value
  if (has_slot(value, "[[StringData]]"))
    return get_slot(value, "[[StringData]]")
  throw new TypeError("Receiver is not a string or String object")
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
      if (is_lead_surrogate(first) && index + 1 < text.length) {
        const second = unit(text, index + 1)
        if (is_trail_surrogate(second)) size = 2
      }
      const value = string_slice(text, index, index + size)
      index = index + size
      return { value, done: false }
    },
  }
  ordinary_set_prototype_of(result, iterator_prototype)
  return result
}

// Turns an index that counts from the end when negative into one between 0
// and `length`: relative_index(-1, 5) is 4, relative_index(-10, 5) is 0, and
// relative_index(9, 5) is 5.
function relative_index(value, length) {
  const index = to_integer_or_infinity(value)
  if (index < 0) return index < -length ? 0 : length + index
  return index > length ? length : index
}

function text_receiver(value) {
  return to_string(require_object_coercible(value))
}
function clamp(value, length) {
  const index = to_integer_or_infinity(value)
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
  if (point <= 0xffff) return character(point)
  const offset = point - 0x10000
  return (
    character(0xd800 + (offset - (offset % 0x400)) / 0x400) +
    character(0xdc00 + (offset % 0x400))
  )
}

function is_lead_surrogate(code) {
  return code >= 0xd800 && code <= 0xdbff
}

function is_trail_surrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff
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
  if (length > MAX_STRING_LENGTH) throw new RangeError("Invalid string length")
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

/**
 * Expands the `$` patterns in a replacement string:
 *
 *   "abc".replace("b", "[$`|$&|$']")  // "a[a|b|c]c"
 *
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-getsubstitution
 */
export function substitution(
  replacement,
  match,
  position,
  text,
  captures = [],
) {
  let result = ""
  let index = 0
  let next
  while (index < replacement.length) {
    if (unit(replacement, index) === 36 && index + 1 < replacement.length) {
      next = unit(replacement, index + 1)
      const group = capture_reference(replacement, index + 1, captures.length)
      if (group > 0) {
        result = result + (captures[group - 1] ?? "")
        index = index + (group > 9 ? 3 : 2)
      } else if (next === 36) {
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
// Returns the group number of the $n or $nn reference at `index`, or 0 if
// there isn't one. A two-digit number is used only if that group exists:
// with 12 groups, "$12" is group 12, but with 1 group it's group 1 followed
// by "2".
function capture_reference(replacement, index, count) {
  const first = unit(replacement, index) - 48
  if (first < 0 || first > 9) return 0
  if (index + 1 < replacement.length) {
    const second = unit(replacement, index + 1) - 48
    if (second >= 0 && second <= 9 && first * 10 + second >= 1) {
      if (first * 10 + second <= count) return first * 10 + second
    }
  }
  return first >= 1 && first <= count ? first : 0
}

/**
 * Implements both replace and replaceAll; `all` selects replaceAll.
 * https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.replace
 */
function replace(value, search, replacement, all) {
  require_object_coercible(value)
  if (search !== undefined && search !== null) {
    const replacer = search[well_known_symbols.replace]
    if (replacer !== undefined && replacer !== null) {
      if (all && has_slot(search, "[[RegExpMatcher]]")) {
        const flags = to_string(search.flags)
        if (find(flags, "g", 0) < 0)
          throw new TypeError("replaceAll requires a global RegExp")
      }
      return call(replacer, search, [value, replacement])
    }
  }
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
      ? to_string(call(replacement, undefined, [needle, position, text]))
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
