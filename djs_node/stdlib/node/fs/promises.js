import { io_open, io_read, io_close, byte_buffer } from "djs:intrinsics"
import Utf8Decoder from "./utf8.js"

export async function readFile(path, encoding) {
  if (typeof path !== "string") throw new TypeError("path must be a string")
  if (typeof encoding !== "string")
    throw new TypeError("readFile requires an explicit utf8 encoding")
  if (encoding !== "utf8" && encoding !== "utf-8")
    throw new TypeError("Only utf8 encoding is supported")
  // Allocate before opening so allocation failure cannot leak a file handle.
  const buffer = byte_buffer(4096)
  const decoder = new Utf8Decoder()
  const handle = await open(path)
  let text
  try {
    let count = await read(handle, buffer)
    while (count !== 0) {
      decoder.write(buffer, count)
      count = await read(handle, buffer)
    }
    text = decoder.finish()
  } catch (error) {
    // Preserve the read error even if cleanup also fails.
    try {
      await close(handle)
    } catch {}
    throw error
  }
  await close(handle)
  return text
}

function open(path) {
  return new Promise((resolve, reject) => {
    io_open(path, "r", 0o666, resolve, reject)
  })
}

function read(handle, buffer) {
  return new Promise((resolve, reject) => {
    io_read(handle, buffer, 0, buffer.length, resolve, reject)
  })
}

function close(handle) {
  return new Promise((resolve, reject) => {
    io_close(handle, resolve, reject)
  })
}

export default { readFile }
