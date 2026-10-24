import { io_open, io_read, io_close, byte_buffer } from "djs:intrinsics"
import Utf8Decoder from "djs:utf8"

function close(handle) {
  return new Promise(function (resolve, reject) {
    io_close(handle, resolve, reject)
  })
}

export function readFile(path, encoding) {
  return new Promise(function (resolve, reject) {
    if (typeof path !== "string") throw new TypeError("path must be a string")
    if (typeof encoding !== "string")
      throw new TypeError("readFile requires an explicit utf8 encoding")
    if (encoding !== "utf8" && encoding !== "utf-8")
      throw new TypeError("Only utf8 encoding is supported")
    // Allocate before opening so allocation failure cannot leak a file handle.
    const buffer = byte_buffer(4096)
    const decoder = new Utf8Decoder()
    io_open(
      path,
      "r",
      0o666,
      function (handle) {
        function next() {
          return new Promise(function (resolve, reject) {
            io_read(handle, buffer, 0, buffer.length, resolve, reject)
          }).then(function (count) {
            if (count === 0) return decoder.finish()
            decoder.write(buffer, count)
            return next()
          })
        }
        next().then(
          function (text) {
            close(handle).then(function () {
              resolve(text)
            }, reject)
          },
          function (error) {
            // Preserve the read error even if cleanup also fails.
            close(handle).then(
              function () {
                reject(error)
              },
              function () {
                reject(error)
              },
            )
          },
        )
      },
      reject,
    )
  })
}

export default { readFile }
