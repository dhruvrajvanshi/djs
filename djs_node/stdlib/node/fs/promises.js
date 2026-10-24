const read = @djs_intrinsic("read_file")

export function readFile(path, encoding) {
  return new Promise(function (resolve, reject) {
    read(path, encoding, resolve, reject)
  })
}

export default { readFile }
