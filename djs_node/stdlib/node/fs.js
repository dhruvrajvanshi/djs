import { string_code_unit_at, string_slice } from "djs:vm"
import { io_lstat, io_readlink } from "djs:runtime"
import { raw_array, raw_array_push } from "../raw/array.js"
import { resolve } from "node:path"

const S_IFMT = 0o170000
const S_IFLNK = 0o120000
const MAX_LINKS = 40

export function realpathSync(path) {
  if (typeof path !== "string") throw new TypeError("path must be a string")
  let parts = split_path(resolve(path))
  let current = "/"
  let index = 1
  let links = 0
  while (index < parts.length) {
    const part = parts[index]
    index = index + 1
    if (part === "") continue
    const next = current === "/" ? "/" + part : current + "/" + part
    if ((io_lstat(next).mode & S_IFMT) !== S_IFLNK) {
      current = next
      continue
    }
    links = links + 1
    if (links > MAX_LINKS) {
      const error = new Error("Too many symbolic links: " + path)
      error.code = "ELOOP"
      error.syscall = "realpath"
      error.path = path
      throw error
    }
    // Restart the walk from the link target, since it may contain more links.
    let rest = resolve(current, io_readlink(next))
    while (index < parts.length) {
      rest = rest + "/" + parts[index]
      index = index + 1
    }
    parts = split_path(resolve(rest))
    current = "/"
    index = 1
  }
  return current
}

// The parts of `path` between slashes.
function split_path(path) {
  const parts = raw_array()
  let start = 0
  for (let end = 0; end <= path.length; end = end + 1) {
    if (end < path.length && string_code_unit_at(path, end) !== 47) continue
    raw_array_push(parts, string_slice(path, start, end))
    start = end + 1
  }
  return parts
}

export default { realpathSync }
