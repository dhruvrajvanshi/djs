import type { FS } from "./FS.ts"

/**
 * A Mapping of paths to values of type T
 * Handles normalization of paths in `.get` and `.set` methods
 */
export class PathMap<T> {
  #map = new Map<string, T>()
  #fs: FS
  constructor(fs: FS) {
    this.#fs = fs
  }

  get fs(): FS {
    return this.#fs
  }

  get_or_put(path: string, default_value: () => T): T {
    path = this.#fs.to_absolute(path)
    const existing = this.#map.get(this.#fs.to_absolute(path))
    if (existing !== undefined) {
      return existing
    } else {
      const value = default_value()
      this.#map.set(path, value)
      return value
    }
  }
  get(path: string): T | undefined {
    path = this.#fs.to_absolute(path)
    return this.#map.get(path)
  }
  has(path: string): boolean {
    path = this.#fs.to_absolute(path)
    return this.#map.has(path)
  }

  set(path: string, value: T): void {
    path = this.#fs.to_absolute(path)
    this.#map.set(path, value)
  }

  map_values<U>(f: (value: T) => U): PathMap<U> {
    const result = new PathMap<U>(this.#fs)
    for (const [key, value] of this.entries()) {
      result.set(key, f(value))
    }
    return result
  }

  get size(): number {
    return this.#map.size
  }

  entries(): IterableIterator<[string, T]> {
    return this.#map.entries()
  }
  keys(): IterableIterator<string> {
    return this.#map.keys()
  }
  values(): IterableIterator<T> {
    return this.#map.values()
  }
  toMap(): Map<string, T> {
    const result = new Map<string, T>()
    for (const [path, value] of this.#map.entries()) {
      result.set(path, value)
    }
    return result
  }

  toString(): string {
    return this.#map.toString()
  }
}
