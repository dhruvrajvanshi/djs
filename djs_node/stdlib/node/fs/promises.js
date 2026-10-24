import { io_open, io_read, io_close, byte_buffer } from "djs:intrinsics"
import Utf8Decoder from "./utf8.js"

function close(handle) {
  return new Promise((resolve, reject) => {
    io_close(handle, resolve, reject)
  })
}

export function readFile(path, encoding) {
  return new Promise((resolve, reject) => {
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
      (handle) => {
        function next() {
          return new Promise((resolve, reject) => {
            io_read(handle, buffer, 0, buffer.length, resolve, reject)
          }).then((count) => {
            if (count === 0) return decoder.finish()
            decoder.write(buffer, count)
            return next()
          })
        }
        next().then(
          (text) => {
            close(handle).then(() => resolve(text), reject)
          },
          (error) => {
            // Preserve the read error even if cleanup also fails.
            close(handle).then(
              () => reject(error),
              () => reject(error),
            )
          },
        )
      },
      reject,
    )
  })
}

export default { readFile }
