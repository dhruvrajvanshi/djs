import fs from "node:fs/promises"

export function create_node_host({ stdout = process.stdout } = {}) {
  return {
    read_text(path, encoding) {
      return fs.readFile(path, encoding)
    },
    write_stdout(text) {
      stdout.write(text)
    },
  }
}
