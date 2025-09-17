import { prettify_diagnostics, type Diagnostic } from "djs_ast"
import { FS } from "./FS.ts"
import { PathMap } from "./PathMap.ts"

export class Diagnostics {
  private by_path: PathMap<Diagnostic[]>
  private fs: FS
  constructor(fs: FS) {
    this.by_path = new PathMap(fs)
    this.fs = fs
  }

  static merge(...diagnostics: Diagnostics[]): Diagnostics {
    const fs = diagnostics[0].fs
    const merged = new Diagnostics(fs)
    for (const diag of diagnostics) {
      for (const [path, diag_list] of diag.entries()) {
        merged.by_path.get_or_put(path, () => []).push(...diag_list)
      }
    }
    return merged
  }

  push(path: string, ...diagnostics: Diagnostic[]) {
    path = this.fs.to_absolute(path)
    this.by_path.get_or_put(path, () => []).push(...diagnostics)
  }

  get(path: string): Diagnostic[] {
    return this.by_path.get(path) ?? []
  }

  get size(): number {
    return Array.from(this.by_path.entries()).reduce(
      (sum, [_, diagnostics]) => sum + diagnostics.length,
      0,
    )
  }

  async prettify(fs: FS, colors = true): Promise<string> {
    let errors: string = ""
    for (const [path, diagnostics] of this.by_path.entries()) {
      const pretty_diagnostics = await prettify_diagnostics(
        path.replace(fs.cwd(), "."),
        diagnostics,
        await fs.read_file(path, "utf-8"),
        colors,
      )
      errors += pretty_diagnostics + "\n\n"
    }
    return errors.trimEnd()
  }

  entries(): IterableIterator<[string, Diagnostic[]]> {
    return this.by_path.entries()
  }
}
