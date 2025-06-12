import assert from "node:assert"
import { promises as node_fs } from "node:fs"

export interface FS {
  read_file(path: string, encoding: "utf-8"): Promise<string>
}
export const FS = {
  real: {
    read_file: async (path: string, encoding: "utf-8") =>
      node_fs.readFile(path, encoding),
  } satisfies FS,
  fake: fake_fs,
}

function fake_fs(_files: Record<string, string>): FS {
  const files: Record<string, string> = Object.fromEntries(
    Object.entries(_files).map(([path, content]) => [
      normalize_path(path),
      content,
    ]),
  )
  return {
    read_file: async (path_: string, encoding: "utf-8") => {
      const path = normalize_path(path_)
      assert.equal(encoding, "utf-8")
      if (!(path in files)) {
        throw new Error(`File not found: ${path}`)
      }
      return files[path]
    },
  }
}
function normalize_path(path: string): string {
  return path.replace(/^\.\//g, "")
}
