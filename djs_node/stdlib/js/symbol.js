import {
  well_known_symbol,
  symbol_create,
  symbol_description,
  object_create,
  has_property,
  define_property,
  builtin_function,
} from "djs:intrinsics"
import { to_string, make_constructor } from "djs:abstract"
import { object_prototype } from "./object.js"
import { define_methods } from "./support.js"

const registry = object_create(null)
const registry_keys = object_create(null)

function Symbol(description) {
  if (new.target !== undefined)
    throw new TypeError("Symbol is not a constructor")
  return symbol_create(
    description === undefined ? undefined : to_string(description),
  )
}
builtin_function(Symbol, 0)
export const symbol_prototype = object_create(object_prototype)
make_constructor(Symbol, symbol_prototype)

define_methods(Symbol, {
  for(key) {
    const text = to_string(key)
    if (has_property(registry, text)) return registry[text]
    const symbol = symbol_create(text)
    registry[text] = symbol
    registry_keys[symbol] = text
    return symbol
  },

  keyFor(symbol) {
    if (typeof symbol !== "symbol") throw new TypeError("Expected a symbol")
    return registry_keys[symbol]
  },
})

define_methods(symbol_prototype, {
  get description() {
    return symbol_description(this_symbol_value(this))
  },

  toString() {
    return descriptive_string(this_symbol_value(this))
  },

  valueOf() {
    return this_symbol_value(this)
  },
})

const well_known = [
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
]
let index = 0
while (index < well_known.length) {
  define_property(Symbol, well_known[index], {
    value: well_known_symbol(well_known[index]),
    writable: false,
    enumerable: false,
    configurable: false,
  })
  index = index + 1
}

function this_symbol_value(value) {
  if (typeof value === "symbol") return value
  throw new TypeError("Receiver is not a symbol")
}

export function descriptive_string(symbol) {
  const description = symbol_description(symbol)
  return "Symbol(" + (description === undefined ? "" : description) + ")"
}

export default Symbol
