import Symbol from "./symbol.js"

class IteratorPrototype {
  [Symbol.iterator]() {
    return this
  }
}

export const iterator_prototype = IteratorPrototype.prototype
