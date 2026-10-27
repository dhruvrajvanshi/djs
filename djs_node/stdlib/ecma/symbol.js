import {
  create_builtin_function,
  define_own_property,
  ordinary_own_property_keys,
  symbol_create,
  symbol_description,
  well_known_symbols,
  well_known_intrinsic_objects,
} from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"
import { raw_object } from "../raw/object.js"
import { to_string } from "./abstract-operations.js"

const { "%Symbol.prototype%": symbol_prototype } = well_known_intrinsic_objects

const registry = raw_object()
const registry_keys = raw_object()

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-constructor
 */
const Symbol = create_builtin_function(
  function (description = undefined) {
    if (new.target !== undefined)
      throw new TypeError("Symbol is not a constructor")
    return symbol_create(
      description === undefined ? undefined : to_string(description),
    )
  },
  { name: "Symbol", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-symbol-constructor
 */
define_builtin_properties(Symbol, {
  for(key) {
    const text = to_string(key)
    if (text in registry) return registry[text]
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
const names = ordinary_own_property_keys(well_known_symbols)
let index = 0
while (index < names.length) {
  define_own_property(Symbol, names[index], {
    value: well_known_symbols[names[index]],
    writable: false,
    enumerable: false,
    configurable: false,
  })
  index = index + 1
}
define_own_property(Symbol, "prototype", {
  value: symbol_prototype,
  writable: false,
  enumerable: false,
  configurable: false,
})

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-symbol-prototype-object
 */
define_builtin_properties(symbol_prototype, {
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
})

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-thissymbolvalue
 */
function this_symbol_value(value) {
  if (typeof value === "symbol") return value
  throw new TypeError("Receiver is not a symbol")
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symboldescriptivestring
 */
export function descriptive_string(symbol) {
  const description = symbol_description(symbol)
  return "Symbol(" + (description === undefined ? "" : description) + ")"
}

export default Symbol
