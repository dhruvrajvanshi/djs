import type { SourceFile } from "djs_ast"
import type { FS } from "./FS.ts"
import { PathMap } from "./PathMap.ts"

export class SourceFiles {
  #files: PathMap<SourceFile>

  constructor(fs: FS) {
    this.#files = new PathMap<SourceFile>(fs)
  }

  get(path: string): SourceFile | undefined {
    return this.#files.get(path)
  }
  set(path: string, source_file: SourceFile): void {
    this.#files.set(path, source_file)
  }
  entries(): IterableIterator<[string, SourceFile]> {
    return this.#files.entries()
  }
  values(): IterableIterator<SourceFile> {
    return this.#files.values()
  }
  get size(): number {
    return this.#files.size
  }
  toString(): string {
    return this.#files.toString()
  }
}
