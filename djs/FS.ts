import { promises as node_fs } from "node:fs"
import Path from "node:path"

export interface FS {
  read_file(path: string, encoding: "utf-8"): Promise<string>
  to_absolute(path: string): string
  cwd(): string
}

const real_fs: FS = {
  read_file: async (path, encoding) => node_fs.readFile(path, encoding),
  to_absolute: (path) => Path.resolve(path),
  cwd: () => process.cwd(),
}

export const FS = {
  real: real_fs,
  fake: fake_fs,
}

function fake_fs(_files: Record<string, string>): FS {
  const cwd = "/"
  const files: Record<string, string> = Object.fromEntries(
    Object.entries(_files).map(([path, content]) => [
      to_absolute(path),
      content,
    ]),
  )
  function to_absolute(path: string): string {
    return Path.normalize(Path.join(cwd, path))
  }

  return {
    read_file: async (path_) => {
      const path = to_absolute(path_)
      if (!(path in files)) {
        throw new Error(`File not found: ${path}`)
      }
      return files[path]
    },
    to_absolute,
    cwd: () => cwd,
  }
}
