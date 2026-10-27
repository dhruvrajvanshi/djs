import { string_code_unit_at, string_slice } from "djs:vm"
import { process_cwd } from "djs:runtime"
import {
  raw_array,
  raw_array_join,
  raw_array_pop,
  raw_array_push,
} from "../raw/array.js"

const SLASH = 47

export function isAbsolute(path) {
  validate(path)
  return path.length > 0 && string_code_unit_at(path, 0) === SLASH
}

export function join(...paths) {
  let joined = ""
  for (let index = 0; index < paths.length; index = index + 1) {
    const path = paths[index]
    validate(path)
    if (path.length === 0) continue
    joined = joined.length === 0 ? path : joined + "/" + path
  }
  if (joined.length === 0) return "."
  const absolute = string_code_unit_at(joined, 0) === SLASH
  const trailing = string_code_unit_at(joined, joined.length - 1) === SLASH
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
    absolute = string_code_unit_at(path, 0) === SLASH
  }
  const result = normalize_segments(resolved, !absolute)
  if (absolute) return "/" + result
  return result.length > 0 ? result : "."
}

// Joins the segments of `path` with "/", dropping empty and "." segments and
// applying "..".
function normalize_segments(path, allow_above_root) {
  const segments = raw_array()
  let start = 0
  for (let end = 0; end <= path.length; end = end + 1) {
    if (end < path.length && string_code_unit_at(path, end) !== SLASH) continue
    const segment = string_slice(path, start, end)
    start = end + 1
    if (segment.length === 0 || segment === ".") continue
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..")
        raw_array_pop(segments)
      else if (allow_above_root) raw_array_push(segments, "..")
    } else raw_array_push(segments, segment)
  }
  return raw_array_join(segments, "/")
}

function validate(path) {
  if (typeof path !== "string") throw new TypeError("path must be a string")
}

export default { isAbsolute, join, resolve }
