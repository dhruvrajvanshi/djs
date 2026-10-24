const read = @djs_intrinsic("read_file")

export function readFile(path, encoding) {
  return read(path, encoding)
}

export default { readFile }
