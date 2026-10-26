import { io_lstat, io_readlink } from "djs:host"
import { resolve } from "node:path"

const S_IFMT = 0o170000
const S_IFLNK = 0o120000
const MAX_LINKS = 40

export function realpathSync(path) {
  if (typeof path !== "string") throw new TypeError("path must be a string")
  let parts = resolve(path).split("/")
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
    const target = resolve(current, io_readlink(next))
    parts = resolve(target, ...parts.slice(index)).split("/")
    current = "/"
    index = 1
  }
  return current
}

export default { realpathSync }
