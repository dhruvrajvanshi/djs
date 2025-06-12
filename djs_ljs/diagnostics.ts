import { prettify_diagnostics, type Diagnostic } from "djs_ast"
import type { FS } from "./FS.ts"
import { promises as node_fs } from "node:fs"

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

  async prettify(fs: FS = node_fs): Promise<string> {
    let errors: string = ""
    for (const path in this.#by_path) {
      const diagnostics = await prettify_diagnostics(
        path,
        this.#by_path[path],
        await fs.readFile(path, "utf-8"),
      )
      errors += diagnostics + "\n\n"
    }
    return errors.trimEnd()
  }
}
