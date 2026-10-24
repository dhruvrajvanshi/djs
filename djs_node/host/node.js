import fs from "node:fs/promises"

export function create_node_host({ stdout = process.stdout } = {}) {
  const files = new Map()
  let next_handle = 1
  function file(handle) {
    const value = files.get(handle)
    if (!value)
      throw Object.assign(new Error("Bad file handle"), { code: "EBADF" })
    return value
  }
  return {
    read_text(path, encoding) {
      return fs.readFile(path, encoding)
    },
    async open(path, flags, mode) {
      const value = await fs.open(path, flags, mode)
      const handle = next_handle++
      files.set(handle, value)
      return handle
    },
    async read(handle, length) {
      const value = file(handle)
      const bytes = new Uint8Array(length)
      const { bytesRead } = await value.read(bytes, 0, length, null)
      return bytes.subarray(0, bytesRead)
    },
    async close(handle) {
      const value = file(handle)
      files.delete(handle)
      await value.close()
    },
    write_stdout(text) {
      stdout.write(text)
    },
  }
}
