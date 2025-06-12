import { prettify_diagnostics, type Diagnostic } from "djs_ast"
import { FS } from "./FS.ts"

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

  get(path: string): Diagnostic[] {
    return this.#by_path[path] ?? []
  }

  async prettify(fs: FS = FS.real): Promise<string> {
    let errors: string = ""
    for (const path in this.#by_path) {
      const diagnostics = await prettify_diagnostics(
        path,
        this.#by_path[path],
        await fs.read_file(path, "utf-8"),
      )
      errors += diagnostics + "\n\n"
    }
    return errors.trimEnd()
  }
}
