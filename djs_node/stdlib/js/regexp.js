// 22.2 RegExp (Regular Expression) Objects
import {
  well_known,
  slot,
  internal_method,
  attributes,
  abstract_operation,
  string_code_unit_at as unit,
  string_slice,
  has_slot,
  get_slot,
  set_slot,
  array_create,
  ordinary_object_create,
  define_property_or_throw,
  call,
  create_builtin_function,
} from "djs:native"
import {
  to_string,
  to_length,
  create_data_property_or_throw,
  get_prototype_from_constructor,
} from "djs:abstract"
import { ObjectPrototype, FunctionPrototype } from "./fundamental.js"
import Symbol from "./symbol.js"
import { substitution } from "./string.js"

// 22.2.4 The RegExp Constructor
const RegExp = well_known("%RegExp%", create_builtin_function, {
  [slot("[[Prototype]]")]: FunctionPrototype,

  // 22.2.4.1 RegExp ( pattern, flags )
  [internal_method("[[Call]]", "[[Construct]]")]: function RegExp(
    pattern,
    flags,
  ) {
    let source = pattern
    if (is_regexp(pattern)) {
      if (new.target === undefined && flags === undefined) return pattern
      source = get_slot(pattern, "[[OriginalSource]]")
      if (flags === undefined) flags = get_slot(pattern, "[[OriginalFlags]]")
    }
    return regexp_create_with_prototype(
      source,
      flags,
      get_prototype_from_constructor(new.target ?? RegExp, RegExpPrototype),
    )
  },

  // 22.2.5 Properties of the RegExp Constructor
  prototype: attributes(
    { writable: false, configurable: false },
    RegExpPrototype,
  ),
})

// 22.2.6 Properties of the RegExp Prototype Object
const RegExpPrototype = well_known(
  "%RegExp.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ObjectPrototype,
    constructor: RegExp,

    // 22.2.6.2 RegExp.prototype.exec ( string )
    exec(string) {
      return regexp_builtin_exec(this_regexp(this), to_string(string))
    },

    // 22.2.6.4 get RegExp.prototype.flags
    get flags() {
      return get_slot(this_regexp(this), "[[OriginalFlags]]")
    },

    // 22.2.6.5 get RegExp.prototype.global
    get global() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").global
    },

    // 22.2.6.6 get RegExp.prototype.ignoreCase
    get ignoreCase() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").ignore_case
    },

    // 22.2.6.9 get RegExp.prototype.multiline
    get multiline() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").multiline
    },

    // 22.2.6.3 get RegExp.prototype.dotAll
    get dotAll() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").dot_all
    },

    // 22.2.6.13 get RegExp.prototype.source
    get source() {
      const source = get_slot(this_regexp(this), "[[OriginalSource]]")
      return source.length === 0 ? "(?:)" : source
    },

    // 22.2.6.14 get RegExp.prototype.sticky
    get sticky() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").sticky
    },

    // 22.2.6.16 RegExp.prototype.test ( S )
    test(S) {
      return regexp_builtin_exec(this_regexp(this), to_string(S)) !== null
    },

    // 22.2.6.17 RegExp.prototype.toString ( )
    toString() {
      return "/" + this.source + "/" + this.flags
    },

    // 22.2.6.18 get RegExp.prototype.unicode
    get unicode() {
      return get_slot(this_regexp(this), "[[RegExpMatcher]]").unicode
    },

    // 22.2.6.11 RegExp.prototype [ %Symbol.replace% ] ( string, replaceValue )
    [Symbol.replace](string, replaceValue) {
      const rx = this_regexp(this)
      const S = to_string(string)
      const functional = typeof replaceValue === "function"
      const template = functional ? undefined : to_string(replaceValue)
      const global = get_slot(rx, "[[RegExpMatcher]]").global
      if (global) rx.lastIndex = 0
      const results = []
      let result = regexp_builtin_exec(rx, S)
      while (result !== null) {
        results.push(result)
        if (!global) break
        if (result[0].length === 0) rx.lastIndex = to_length(rx.lastIndex) + 1
        result = regexp_builtin_exec(rx, S)
      }
      let accumulated = ""
      let next_position = 0
      let index = 0
      while (index < results.length) {
        result = results[index]
        const matched = result[0]
        const position = result.index
        const captures = []
        let n = 1
        while (n < result.length) {
          captures.push(result[n])
          n = n + 1
        }
        let replacement
        if (functional) {
          const args = [matched]
          append(args, captures)
          args.push(position, S)
          replacement = to_string(call(replaceValue, undefined, ...args))
        } else {
          replacement = substitution(template, matched, position, S, captures)
        }
        if (position >= next_position) {
          accumulated =
            accumulated + string_slice(S, next_position, position) + replacement
          next_position = position + matched.length
        }
        index = index + 1
      }
      return accumulated + string_slice(S, next_position, S.length)
    },
  },
)

// 22.2.3.1 RegExpCreate ( P, F )
function regexp_create(P, F) {
  return regexp_create_with_prototype(P, F, RegExpPrototype)
}
abstract_operation("RegExpCreate", regexp_create)

// 22.2.3.3 RegExpInitialize ( obj, pattern, flags )
function regexp_create_with_prototype(pattern, flags, prototype) {
  const P = pattern === undefined ? "" : to_string(pattern)
  const F = flags === undefined ? "" : to_string(flags)
  const matcher = {
    global: false,
    ignore_case: false,
    multiline: false,
    dot_all: false,
    unicode: false,
    sticky: false,
    group_count: 0,
    node: undefined,
  }
  let seen = ""
  let index = 0
  while (index < F.length) {
    const flag = string_slice(F, index, index + 1)
    let duplicate = false
    let position = 0
    while (position < seen.length) {
      if (string_slice(seen, position, position + 1) === flag) duplicate = true
      position = position + 1
    }
    if (duplicate)
      throw new SyntaxError(`Invalid regular expression flags '${F}'`)
    if (flag === "g") matcher.global = true
    else if (flag === "i") matcher.ignore_case = true
    else if (flag === "m") matcher.multiline = true
    else if (flag === "s") matcher.dot_all = true
    else if (flag === "u") matcher.unicode = true
    else if (flag === "y") matcher.sticky = true
    else if (flag !== "d")
      throw new SyntaxError(`Invalid regular expression flags '${F}'`)
    seen = seen + flag
    index = index + 1
  }
  const parser = { source: P, index: 0, group_count: 0 }
  matcher.node = parse_disjunction(parser)
  if (parser.index < P.length) throw pattern_error(parser, "Unmatched ')'")
  matcher.group_count = parser.group_count
  const R = ordinary_object_create(prototype, [
    "[[OriginalSource]]",
    "[[OriginalFlags]]",
    "[[RegExpMatcher]]",
  ])
  set_slot(R, "[[OriginalSource]]", P)
  set_slot(R, "[[OriginalFlags]]", F)
  set_slot(R, "[[RegExpMatcher]]", matcher)
  define_property_or_throw(R, "lastIndex", { value: 0, writable: true })
  return R
}

function is_regexp(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    has_slot(value, "[[RegExpMatcher]]")
  )
}

function this_regexp(value) {
  if (!is_regexp(value)) throw new TypeError("Receiver is not a RegExp")
  return value
}

// 22.2.7.2 RegExpBuiltinExec ( R, S )
function regexp_builtin_exec(R, S) {
  const matcher = get_slot(R, "[[RegExpMatcher]]")
  const global_or_sticky = matcher.global || matcher.sticky
  let last_index = global_or_sticky ? to_length(R.lastIndex) : 0
  const captures = []
  let end = -1
  while (end < 0) {
    if (last_index > S.length) {
      if (global_or_sticky) R.lastIndex = 0
      return null
    }
    let index = 0
    while (index < matcher.group_count * 2) {
      captures[index] = -1
      index = index + 1
    }
    const context = { input: S, matcher, captures }
    match_node(matcher.node, context, last_index, (position) => {
      end = position
      return true
    })
    if (end < 0) {
      if (matcher.sticky) {
        R.lastIndex = 0
        return null
      }
      last_index = last_index + 1
    }
  }
  if (global_or_sticky) R.lastIndex = end
  const A = array_create(0)
  create_data_property_or_throw(A, "index", last_index)
  create_data_property_or_throw(A, "input", S)
  create_data_property_or_throw(A, 0, string_slice(S, last_index, end))
  let group = 1
  while (group <= matcher.group_count) {
    const start = captures[group * 2 - 2]
    create_data_property_or_throw(
      A,
      group,
      start < 0 ? undefined : string_slice(S, start, captures[group * 2 - 1]),
    )
    group = group + 1
  }
  create_data_property_or_throw(A, "groups", undefined)
  return A
}

// The pattern compiles to a tree of these nodes, matched by backtracking:
// `match_node` calls `next` with each position the node can end at, most
// preferred first, until `next` accepts one.
//
//   { type: "char", code }               { type: "class", ranges, negated }
//   { type: "any" }                      { type: "sequence", items }
//   { type: "alternation", options }     { type: "group", index, body }
//   { type: "repeat", body, min, max, greedy }
//   { type: "look", body, negated }      { type: "backreference", index }
//   { type: "start" }  { type: "end" }   { type: "boundary", negated }
//
// `ranges` are inclusive [low, high] code unit pairs. A group's `index` is
// -1 when it doesn't capture.

function match_node(node, context, position, next) {
  const input = context.input
  const type = node.type
  if (type === "char") {
    if (
      position < input.length &&
      same_unit(context, unit(input, position), node.code)
    )
      return next(position + 1)
    return false
  }
  if (type === "any") {
    if (position >= input.length) return false
    if (!context.matcher.dot_all && line_terminator(unit(input, position)))
      return false
    return next(position + 1)
  }
  if (type === "class") {
    if (position >= input.length) return false
    if (class_matches(context, node, unit(input, position)) === node.negated)
      return false
    return next(position + 1)
  }
  if (type === "sequence") {
    const items = node.items
    const step = (index, at) =>
      index === items.length
        ? next(at)
        : match_node(items[index], context, at, (end) => step(index + 1, end))
    return step(0, position)
  }
  if (type === "alternation") {
    let index = 0
    while (index < node.options.length) {
      if (match_node(node.options[index], context, position, next)) return true
      index = index + 1
    }
    return false
  }
  if (type === "group") {
    if (node.index < 0) return match_node(node.body, context, position, next)
    const captures = context.captures
    const slot_index = node.index * 2 - 2
    return match_node(node.body, context, position, (end) => {
      const old_start = captures[slot_index]
      const old_end = captures[slot_index + 1]
      captures[slot_index] = position
      captures[slot_index + 1] = end
      if (next(end)) return true
      captures[slot_index] = old_start
      captures[slot_index + 1] = old_end
      return false
    })
  }
  if (type === "repeat") {
    const attempt = (count, at) => {
      const more = () =>
        count < node.max &&
        match_node(node.body, context, at, (end) =>
          // An iteration that matches nothing would repeat forever.
          end === at ? false : attempt(count + 1, end),
        )
      if (count < node.min) return more()
      if (node.greedy) return more() || next(at)
      return next(at) || more()
    }
    return attempt(0, position)
  }
  if (type === "look") {
    const matched = match_node(node.body, context, position, () => true)
    return matched === node.negated ? false : next(position)
  }
  if (type === "backreference") {
    const start = context.captures[node.index * 2 - 2]
    if (start < 0) return next(position)
    const length = context.captures[node.index * 2 - 1] - start
    if (position + length > input.length) return false
    let index = 0
    while (index < length) {
      if (
        !same_unit(
          context,
          unit(input, start + index),
          unit(input, position + index),
        )
      )
        return false
      index = index + 1
    }
    return next(position + length)
  }
  if (type === "start") {
    if (
      position === 0 ||
      (context.matcher.multiline && line_terminator(unit(input, position - 1)))
    )
      return next(position)
    return false
  }
  if (type === "end") {
    if (
      position === input.length ||
      (context.matcher.multiline && line_terminator(unit(input, position)))
    )
      return next(position)
    return false
  }
  // boundary
  const before = position > 0 && word_character(unit(input, position - 1))
  const after = position < input.length && word_character(unit(input, position))
  return (before !== after) !== node.negated ? next(position) : false
}

function fold(code) {
  return code >= 65 && code <= 90 ? code + 32 : code
}

// Case folding with the i flag only covers ASCII letters.
function same_unit(context, a, b) {
  if (a === b) return true
  return context.matcher.ignore_case && fold(a) === fold(b)
}

function in_ranges(ranges, code) {
  let index = 0
  while (index < ranges.length) {
    if (code >= ranges[index][0] && code <= ranges[index][1]) return true
    index = index + 1
  }
  return false
}

function class_matches(context, node, code) {
  if (in_ranges(node.ranges, code)) return true
  if (!context.matcher.ignore_case) return false
  const lower = fold(code)
  const upper = code >= 97 && code <= 122 ? code - 32 : code
  return in_ranges(node.ranges, lower) || in_ranges(node.ranges, upper)
}

function line_terminator(code) {
  return code === 10 || code === 13 || code === 8232 || code === 8233
}

function word_character(code) {
  return in_ranges(WORD_RANGES, code)
}

const DIGIT_RANGES = [[48, 57]]
const WORD_RANGES = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122],
]
const SPACE_RANGES = [
  [9, 13],
  [32, 32],
  [160, 160],
  [5760, 5760],
  [8192, 8202],
  [8232, 8233],
  [8239, 8239],
  [8287, 8287],
  [12288, 12288],
  [65279, 65279],
]

function complement(ranges) {
  const sorted = ranges.slice()
  sorted.sort((a, b) => a[0] - b[0])
  const result = []
  let low = 0
  let index = 0
  while (index < sorted.length) {
    if (sorted[index][0] > low) result.push([low, sorted[index][0] - 1])
    if (sorted[index][1] + 1 > low) low = sorted[index][1] + 1
    index = index + 1
  }
  if (low <= 65535) result.push([low, 65535])
  return result
}

// 22.2.1 Patterns

function pattern_error(parser, message) {
  return new SyntaxError(
    `Invalid regular expression: /${parser.source}/: ${message}`,
  )
}

function peek(parser, offset = 0) {
  const index = parser.index + offset
  return index < parser.source.length ? unit(parser.source, index) : -1
}

function parse_disjunction(parser) {
  const options = [parse_alternative(parser)]
  while (peek(parser) === 124) {
    parser.index = parser.index + 1
    options.push(parse_alternative(parser))
  }
  return options.length === 1 ? options[0] : { type: "alternation", options }
}

function parse_alternative(parser) {
  const items = []
  while (
    parser.index < parser.source.length &&
    peek(parser) !== 124 &&
    peek(parser) !== 41
  )
    items.push(parse_term(parser))
  return { type: "sequence", items }
}

function parse_term(parser) {
  const code = peek(parser)
  if (code === 94) {
    parser.index = parser.index + 1
    return { type: "start" }
  }
  if (code === 36) {
    parser.index = parser.index + 1
    return { type: "end" }
  }
  if (code === 92 && (peek(parser, 1) === 98 || peek(parser, 1) === 66)) {
    parser.index = parser.index + 2
    return { type: "boundary", negated: peek(parser, -1) === 66 }
  }
  return parse_quantifier(parser, parse_atom(parser))
}

function parse_quantifier(parser, atom) {
  let min
  let max
  const code = peek(parser)
  if (code === 42) {
    min = 0
    max = Infinity
    parser.index = parser.index + 1
  } else if (code === 43) {
    min = 1
    max = Infinity
    parser.index = parser.index + 1
  } else if (code === 63) {
    min = 0
    max = 1
    parser.index = parser.index + 1
  } else if (code === 123) {
    const start = parser.index
    parser.index = parser.index + 1
    min = parse_decimal(parser)
    max = min
    if (min !== undefined && peek(parser) === 44) {
      parser.index = parser.index + 1
      max = parse_decimal(parser) ?? Infinity
    }
    if (min === undefined || peek(parser) !== 125) {
      // Annex B: a brace that doesn't start a quantifier is a literal.
      parser.index = start
      return atom
    }
    parser.index = parser.index + 1
    if (max < min)
      throw pattern_error(parser, "numbers out of order in {} quantifier")
  } else {
    return atom
  }
  let greedy = true
  if (peek(parser) === 63) {
    greedy = false
    parser.index = parser.index + 1
  }
  return { type: "repeat", body: atom, min, max, greedy }
}

function parse_decimal(parser) {
  let value
  while (peek(parser) >= 48 && peek(parser) <= 57) {
    value = (value ?? 0) * 10 + peek(parser) - 48
    parser.index = parser.index + 1
  }
  return value
}

function parse_atom(parser) {
  const code = peek(parser)
  parser.index = parser.index + 1
  if (code === 46) return { type: "any" }
  if (code === 91) return parse_class(parser)
  if (code === 92) return parse_atom_escape(parser)
  if (code === 40) return parse_group(parser)
  if (code === 42 || code === 43 || code === 63)
    throw pattern_error(parser, "Nothing to repeat")
  return { type: "char", code }
}

function parse_group(parser) {
  let index = -1
  let negated = false
  let look = false
  if (peek(parser) === 63) {
    const kind = peek(parser, 1)
    if (kind === 58) {
      parser.index = parser.index + 2
    } else if (kind === 61 || kind === 33) {
      look = true
      negated = kind === 33
      parser.index = parser.index + 2
    } else if (
      kind === 60 &&
      peek(parser, 2) !== 61 &&
      peek(parser, 2) !== 33
    ) {
      // A named group captures like any other; its name is not recorded.
      parser.index = parser.index + 2
      while (parser.index < parser.source.length && peek(parser) !== 62)
        parser.index = parser.index + 1
      parser.index = parser.index + 1
      parser.group_count = parser.group_count + 1
      index = parser.group_count
    } else {
      throw pattern_error(parser, "Invalid group")
    }
  } else {
    parser.group_count = parser.group_count + 1
    index = parser.group_count
  }
  const body = parse_disjunction(parser)
  if (peek(parser) !== 41) throw pattern_error(parser, "Unterminated group")
  parser.index = parser.index + 1
  if (look) return { type: "look", body, negated }
  return { type: "group", index, body }
}

function parse_atom_escape(parser) {
  const code = peek(parser)
  if (code >= 49 && code <= 57) {
    return { type: "backreference", index: parse_decimal(parser) }
  }
  const ranges = class_escape(parser)
  if (ranges !== undefined) return { type: "class", ranges, negated: false }
  return { type: "char", code: character_escape(parser) }
}

// \d \D \w \W \s \S, or undefined for any other escape.
function class_escape(parser) {
  const code = peek(parser)
  let ranges
  if (code === 100 || code === 68) ranges = DIGIT_RANGES
  else if (code === 119 || code === 87) ranges = WORD_RANGES
  else if (code === 115 || code === 83) ranges = SPACE_RANGES
  else return undefined
  parser.index = parser.index + 1
  return code < 97 ? complement(ranges) : ranges
}

function character_escape(parser) {
  const code = peek(parser)
  if (code < 0) throw pattern_error(parser, "\\ at end of pattern")
  parser.index = parser.index + 1
  if (code === 110) return 10
  if (code === 114) return 13
  if (code === 116) return 9
  if (code === 118) return 11
  if (code === 102) return 12
  if (code === 48) return 0
  if (code === 99) {
    const letter = peek(parser)
    if ((letter >= 65 && letter <= 90) || (letter >= 97 && letter <= 122)) {
      parser.index = parser.index + 1
      return letter % 32
    }
    parser.index = parser.index - 1
    return 92
  }
  if (code === 120) return hex_escape(parser, 2) ?? code
  if (code === 117) {
    if (peek(parser) === 123) {
      parser.index = parser.index + 1
      let value = 0
      while (peek(parser) !== 125) {
        const digit = hex_digit(peek(parser))
        if (digit < 0) throw pattern_error(parser, "Invalid Unicode escape")
        value = value * 16 + digit
        parser.index = parser.index + 1
      }
      parser.index = parser.index + 1
      return value
    }
    return hex_escape(parser, 4) ?? code
  }
  return code
}

function hex_digit(code) {
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 65 && code <= 70) return code - 55
  if (code >= 97 && code <= 102) return code - 87
  return -1
}

// Annex B: an incomplete escape such as \x1 matches the letter itself.
function hex_escape(parser, length) {
  let value = 0
  let index = 0
  while (index < length) {
    const digit = hex_digit(peek(parser, index))
    if (digit < 0) return undefined
    value = value * 16 + digit
    index = index + 1
  }
  parser.index = parser.index + length
  return value
}

function parse_class(parser) {
  let negated = false
  if (peek(parser) === 94) {
    negated = true
    parser.index = parser.index + 1
  }
  const ranges = []
  while (peek(parser) !== 93) {
    if (peek(parser) < 0)
      throw pattern_error(parser, "Unterminated character class")
    const low = parse_class_atom(parser)
    if (typeof low !== "number") {
      append(ranges, low)
      continue
    }
    if (peek(parser) === 45 && peek(parser, 1) !== 93 && peek(parser, 1) >= 0) {
      parser.index = parser.index + 1
      const high = parse_class_atom(parser)
      if (typeof high !== "number") {
        // Annex B: [a-\d] is a, -, and the digits.
        ranges.push([low, low], [45, 45])
        append(ranges, high)
        continue
      }
      if (high < low)
        throw pattern_error(parser, "Range out of order in character class")
      ranges.push([low, high])
    } else {
      ranges.push([low, low])
    }
  }
  parser.index = parser.index + 1
  return { type: "class", ranges, negated }
}

function append(list, more) {
  let index = 0
  while (index < more.length) {
    list.push(more[index])
    index = index + 1
  }
}

// A code unit, or the ranges of a class escape such as \d.
function parse_class_atom(parser) {
  const code = peek(parser)
  parser.index = parser.index + 1
  if (code !== 92) return code
  if (peek(parser) === 98) {
    parser.index = parser.index + 1
    return 8
  }
  if (peek(parser) === 45) {
    parser.index = parser.index + 1
    return 45
  }
  return class_escape(parser) ?? character_escape(parser)
}

export default RegExp
