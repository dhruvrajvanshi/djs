import {
  read_number,
  read_string,
  write_string,
  write_undefined,
} from "./values.js"
import { byte_buffer_view, create_byte_buffer } from "./bytes.js"
import { kind_of } from "./objects.js"
import { KINDS } from "./memory.js"
import { enqueue_job, start_operation } from "../runtime/jobs.js"

export const NATIVE_CODE = 0xffffffff
export const RESUME_CODE = 0xfffffffe
export const INTRINSIC_NAMES = Object.freeze([
  "write_stdout",
  "io_open",
  "io_read",
  "io_close",
  "byte_buffer",
  "string_from_code_unit",
  "enqueue_job",
  "call",
])

export function intrinsic_id(name) {
  const id = INTRINSIC_NAMES.indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown intrinsic: ${name}`)
  return id
}

function integer(memory, value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) throw new TypeError(`${name} is required`)
  const number = read_number(memory, value)
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum)
    throw new RangeError(`Invalid ${name}`)
  return number
}

function string(memory, value, name) {
  if (value === undefined || kind_of(memory, value) !== KINDS.STRING)
    throw new TypeError(`${name} must be a string`)
  return read_string(memory, value)
}

export function call_intrinsic(runtime, id, destination, arguments_) {
  const { memory } = runtime
  const name = INTRINSIC_NAMES[id]
  if (name === "write_stdout") {
    if (!arguments_.length || kind_of(memory, arguments_[0]) !== KINDS.STRING)
      throw new TypeError("write_stdout requires a string")
    runtime.host.write_stdout(read_string(memory, arguments_[0]))
  } else if (name === "enqueue_job") {
    enqueue_job(runtime, arguments_[0])
  } else if (name === "byte_buffer") {
    create_byte_buffer(
      memory,
      destination,
      integer(memory, arguments_[0], "byte buffer length"),
    )
    return
  } else if (name === "string_from_code_unit") {
    write_string(
      memory,
      destination,
      String.fromCharCode(integer(memory, arguments_[0], "code unit", 0xffff)),
    )
    return
  } else if (name === "io_open") {
    const path = string(memory, arguments_[0], "path"),
      flags = string(memory, arguments_[1], "flags"),
      mode = integer(memory, arguments_[2], "mode", 0o7777)
    start_operation(
      runtime,
      arguments_[3],
      arguments_[4],
      () => runtime.host.open(path, flags, mode),
      { syscall: "open", path },
    )
  } else if (name === "io_read") {
    const handle = integer(memory, arguments_[0], "file handle"),
      buffer = arguments_[1],
      offset = integer(memory, arguments_[2], "buffer offset", 0xffffffff),
      length = integer(memory, arguments_[3], "read length", 0xffffffff)
    if (buffer === undefined) throw new TypeError("Expected a byte buffer")
    const capacity = byte_buffer_view(memory, buffer).length
    if (offset > capacity || length > capacity - offset)
      throw new RangeError("Read exceeds byte buffer bounds")
    start_operation(
      runtime,
      arguments_[4],
      arguments_[5],
      () => runtime.host.read(handle, length),
      { buffer, offset, length, syscall: "read" },
    )
  } else if (name === "io_close") {
    const handle = integer(memory, arguments_[0], "file handle")
    start_operation(
      runtime,
      arguments_[1],
      arguments_[2],
      () => runtime.host.close(handle),
      { syscall: "close" },
    )
  } else throw new Error(`Invalid intrinsic ID: ${id}`)
  write_undefined(memory, destination)
}
