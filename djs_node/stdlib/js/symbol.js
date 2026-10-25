// 20.4 Symbol Objects
import {
  well_known,
  slot,
  internal_method,
  attributes,
  well_known_symbol,
  symbol_create,
  symbol_description,
  ordinary_object_create,
  has_property,
  create_builtin_function,
} from "djs:native"
import { to_string } from "djs:abstract"
import { ObjectPrototype, FunctionPrototype } from "./fundamental.js"

const registry = ordinary_object_create(null)
const registry_keys = ordinary_object_create(null)

// 20.4.1 The Symbol Constructor
const Symbol = well_known("%Symbol%", create_builtin_function, {
  [slot("[[Prototype]]")]: FunctionPrototype,

  // 20.4.1.1 Symbol ( [ description ] )
  [internal_method("[[Call]]", "[[Construct]]")]: function Symbol(
    description = undefined,
  ) {
    if (new.target !== undefined)
      throw new TypeError("Symbol is not a constructor")
    return symbol_create(
      description === undefined ? undefined : to_string(description),
    )
  },

  // 20.4.2 Properties of the Symbol Constructor
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

  asyncIterator: attributes(
    { writable: false, configurable: false },
    well_known_symbol("asyncIterator"),
  ),
  hasInstance: attributes(
    { writable: false, configurable: false },
    well_known_symbol("hasInstance"),
  ),
  isConcatSpreadable: attributes(
    { writable: false, configurable: false },
    well_known_symbol("isConcatSpreadable"),
  ),
  iterator: attributes(
    { writable: false, configurable: false },
    well_known_symbol("iterator"),
  ),
  match: attributes(
    { writable: false, configurable: false },
    well_known_symbol("match"),
  ),
  matchAll: attributes(
    { writable: false, configurable: false },
    well_known_symbol("matchAll"),
  ),
  replace: attributes(
    { writable: false, configurable: false },
    well_known_symbol("replace"),
  ),
  search: attributes(
    { writable: false, configurable: false },
    well_known_symbol("search"),
  ),
  species: attributes(
    { writable: false, configurable: false },
    well_known_symbol("species"),
  ),
  split: attributes(
    { writable: false, configurable: false },
    well_known_symbol("split"),
  ),
  toPrimitive: attributes(
    { writable: false, configurable: false },
    well_known_symbol("toPrimitive"),
  ),
  toStringTag: attributes(
    { writable: false, configurable: false },
    well_known_symbol("toStringTag"),
  ),
  unscopables: attributes(
    { writable: false, configurable: false },
    well_known_symbol("unscopables"),
  ),

  prototype: attributes(
    { writable: false, configurable: false },
    SymbolPrototype,
  ),
})

// 20.4.3 Properties of the Symbol Prototype Object
const SymbolPrototype = well_known(
  "%Symbol.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ObjectPrototype,

    constructor: Symbol,

    get description() {
      return symbol_description(this_symbol_value(this))
    },

    toString() {
      return descriptive_string(this_symbol_value(this))
    },

    valueOf() {
      return this_symbol_value(this)
    },
  },
)

// 20.4.3.4.1 ThisSymbolValue ( value )
function this_symbol_value(value) {
  if (typeof value === "symbol") return value
  throw new TypeError("Receiver is not a symbol")
}

// 20.4.3.3.1 SymbolDescriptiveString ( sym )
export function descriptive_string(symbol) {
  const description = symbol_description(symbol)
  return "Symbol(" + (description === undefined ? "" : description) + ")"
}

export default Symbol
