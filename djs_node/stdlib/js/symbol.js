import {
  well_known_symbol,
  symbol_create,
  symbol_description,
  object_create,
  has_property,
  define_property,
} from "djs:intrinsics"
import { to_string } from "./abstract.js"

const registry = object_create(null)
const registry_keys = object_create(null)

@builtin({ name: "Symbol", length: 0 })
class Symbol {
  @internalMethod("Call")
  static #call(thisArgument, args) {
    const description = args[0]
    return symbol_create(
      description === undefined ? undefined : to_string(description),
    )
  }

  @internalMethod("Construct")
  static #construct(args, newTarget) {
    throw new TypeError("Symbol is not a constructor")
  }

  static for(key) {
    const text = to_string(key)
    if (has_property(registry, text)) return registry[text]
    const symbol = symbol_create(text)
    registry[text] = symbol
    registry_keys[symbol] = text
    return symbol
  }

  static keyFor(symbol) {
    if (typeof symbol !== "symbol") throw new TypeError("Expected a symbol")
    return registry_keys[symbol]
  }

  get description() {
    return symbol_description(this_symbol_value(this))
  }

  toString() {
    return descriptive_string(this_symbol_value(this))
  }

  valueOf() {
    return this_symbol_value(this)
  }
}

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
