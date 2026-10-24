import { read_file as read } from "djs:intrinsics"

export function readFile(path, encoding) {
  return new Promise(function (resolve, reject) {
    read(path, encoding, resolve, reject)
  })
}

export default { readFile }
