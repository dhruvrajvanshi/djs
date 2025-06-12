import type { Diagnostic } from "djs_ast"

export class Diagnostics implements Iterable<[string, Diagnostic[]]> {
  #by_path: Record<string, Diagnostic[]> = {}

  push(path: string, ...diagnostics: Diagnostic[]) {
    if (!(path in this.#by_path)) {
      this.#by_path[path] = []
    }
    this.#by_path[path].push(...diagnostics)
  }

  [Symbol.iterator]() {
    return Object.entries(this.#by_path)[Symbol.iterator]()
  }
}
