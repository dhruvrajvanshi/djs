import { process_cwd } from "djs:host"

const SLASH = 47

export function isAbsolute(path) {
  validate(path)
  return path.length > 0 && path.charCodeAt(0) === SLASH
}

export function join(...paths) {
  let joined = ""
  for (const path of paths) {
    validate(path)
    if (path.length === 0) continue
    joined = joined.length === 0 ? path : joined + "/" + path
  }
  if (joined.length === 0) return "."
  const absolute = joined.charCodeAt(0) === SLASH
  const trailing = joined.charCodeAt(joined.length - 1) === SLASH
  let result = normalize_segments(joined, !absolute)
  if (result.length === 0) {
    if (absolute) return "/"
    return trailing ? "./" : "."
  }
  if (trailing) result = result + "/"
  return absolute ? "/" + result : result
}

export function resolve(...paths) {
  let resolved = ""
  let absolute = false
  for (
    let index = paths.length - 1;
    index >= -1 && !absolute;
    index = index - 1
  ) {
    const path = index >= 0 ? paths[index] : process_cwd()
    validate(path)
    if (path.length === 0) continue
    resolved = resolved.length === 0 ? path : path + "/" + resolved
    absolute = path.charCodeAt(0) === SLASH
  }
  const result = normalize_segments(resolved, !absolute)
  if (absolute) return "/" + result
  return result.length > 0 ? result : "."
}

function normalize_segments(path, allow_above_root) {
  const segments = []
  for (const segment of path.split("/")) {
    if (segment.length === 0 || segment === ".") continue
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..")
        segments.pop()
      else if (allow_above_root) segments.push("..")
    } else segments.push(segment)
  }
  return segments.join("/")
}

function validate(path) {
  if (typeof path !== "string") throw new TypeError("path must be a string")
}

export default { isAbsolute, join, resolve }
