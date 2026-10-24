import { read_string, write_undefined } from "./values.js"
import { kind_of, to_string } from "./objects.js"
import { KINDS } from "./memory.js"
import { enqueue_job, start_read } from "../runtime/jobs.js"

export const NATIVE_CODE = 0xffffffff
export const RESUME_CODE = 0xfffffffe
export const INTRINSIC_NAMES = Object.freeze([
  "console_log",
  "read_file",
  "enqueue_job",
  "call",
])

export function intrinsic_id(name) {
  const id = INTRINSIC_NAMES.indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown intrinsic: ${name}`)
  return id
}
export function call_intrinsic(runtime, id, destination, arguments_) {
  const { memory } = runtime
  const name = INTRINSIC_NAMES[id]
  if (name === "console_log") {
    runtime.host.write_stdout(
      arguments_.map((value) => to_string(memory, value)).join(" ") + "\n",
    )
  } else if (name === "enqueue_job") {
    enqueue_job(runtime, arguments_[0])
  } else if (name === "read_file") {
    if (
      arguments_.length < 2 ||
      kind_of(memory, arguments_[1]) !== KINDS.STRING
    )
      throw new TypeError("readFile requires an explicit utf8 encoding")
    const path = read_string(memory, arguments_[0]),
      encoding = read_string(memory, arguments_[1])
    if (encoding !== "utf8" && encoding !== "utf-8")
      throw new TypeError("Only utf8 encoding is supported")
    start_read(runtime, path, encoding, arguments_[2], arguments_[3])
  } else throw new Error(`Invalid intrinsic ID: ${id}`)
  write_undefined(memory, destination)
}
