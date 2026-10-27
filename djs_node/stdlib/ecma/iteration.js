import {
  get_own_property,
  ordinary_get_prototype_of,
  ordinary_own_property_keys,
  set_abstract_operation,
  well_known_symbols,
} from "djs:vm"
import { to_object } from "./abstract-operations.js"
import { raw_array, raw_array_push } from "../raw/array.js"
import { raw_object } from "../raw/object.js"

class IteratorPrototype {
  [well_known_symbols.iterator]() {
    return this
  }
}

export const iterator_prototype = IteratorPrototype.prototype

// A for-in loop visits the keys the object had when the loop started, and
// skips any that were deleted since:
//
//   const o = { a: 1, b: 2 }
//   for (const key in o) delete o.b  // visits only "a"
class ForInIterator {
  #object
  #keys
  #index = 0

  constructor(object, keys) {
    this.#object = object
    this.#keys = keys
  }

  next() {
    while (this.#index < this.#keys.length) {
      const key = this.#keys[this.#index]
      this.#index = this.#index + 1
      if (key in this.#object) return { value: key, done: false }
    }
    return { value: undefined, done: true }
  }
}

/**
 * Returns the keys a for-in loop visits: the object's enumerable string keys,
 * then its prototype's, and so on up the chain. A key on a nearer object hides
 * the same key further up, even when the nearer one isn't enumerable:
 *
 *   const object = Object.create({ a: 1, b: 2 })
 *   Object.defineProperty(object, "a", { value: 3, enumerable: false })
 *   for (const key in object) …  // visits only "b"
 *
 * https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-enumerate-object-properties
 */
function enumerate_object_properties(value) {
  const keys = raw_array()
  if (value === null || value === undefined)
    return new ForInIterator(null, keys)
  const object = to_object(value)
  const visited = raw_object()
  let current = object
  while (current !== null) {
    const own = ordinary_own_property_keys(current)
    let index = 0
    while (index < own.length) {
      const key = own[index]
      index = index + 1
      if (typeof key === "symbol" || key in visited) continue
      visited[key] = true
      if (get_own_property(current, key).enumerable) raw_array_push(keys, key)
    }
    current = ordinary_get_prototype_of(current)
  }
  return new ForInIterator(object, keys)
}
// The VM calls this to start a for-in loop:
//
//   for (const key in object) …  // enumerate_object_properties(object)
set_abstract_operation("EnumerateObjectProperties", enumerate_object_properties)
