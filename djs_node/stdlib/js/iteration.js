import {
  abstract_operation,
  array_create,
  get_own_property,
  has_property,
  ordinary_get_prototype_of,
  ordinary_object_create,
  ordinary_own_property_keys,
} from "djs:native"
import { to_object } from "djs:abstract"
import Symbol from "./symbol.js"

class IteratorPrototype {
  [Symbol.iterator]() {
    return this
  }
}

export const iterator_prototype = IteratorPrototype.prototype

// Visits the snapshot of keys, skipping those deleted since it was taken.
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
      if (has_property(this.#object, key)) return { value: key, done: false }
    }
    return { value: undefined, done: true }
  }
}

// 14.7.5.9 EnumerateObjectProperties ( O )
// Enumerable string keys of the object and its prototype chain. A key appears
// once, for the nearest object that has it, even if that one is not enumerable.
function enumerate_object_properties(value) {
  const keys = array_create(0)
  if (value === null || value === undefined)
    return new ForInIterator(null, keys)
  const object = to_object(value)
  const visited = ordinary_object_create(null)
  let current = object
  while (current !== null) {
    const own = ordinary_own_property_keys(current)
    let index = 0
    while (index < own.length) {
      const key = own[index]
      index = index + 1
      if (typeof key === "symbol" || has_property(visited, key)) continue
      visited[key] = true
      if (get_own_property(current, key).enumerable) keys[keys.length] = key
    }
    current = ordinary_get_prototype_of(current)
  }
  return new ForInIterator(object, keys)
}
abstract_operation("EnumerateObjectProperties", enumerate_object_properties)
