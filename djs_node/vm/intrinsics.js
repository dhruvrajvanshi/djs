import { alloc_root, free_root, copy_value } from "./memory.js"
import { read_string, write_undefined } from "./values.js"
import { kind_of, to_string } from "./objects.js"
import { KINDS } from "./memory.js"
import { create_promise, settle_promise, start_read } from "../runtime/jobs.js"

export const NATIVE_CODE = 0xffffffff
export const INTRINSIC_NAMES = Object.freeze([
  "console_log",
  "read_file",
  "promise_resolve",
  "promise_reject",
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
    write_undefined(memory, destination)
  } else if (name === "read_file") {
    if (
      arguments_.length < 2 ||
      kind_of(memory, arguments_[1]) !== KINDS.STRING
    ) {
      throw new TypeError("readFile requires an explicit utf8 encoding")
    }
    const path = read_string(memory, arguments_[0])
    const encoding = read_string(memory, arguments_[1])
    if (encoding !== "utf8" && encoding !== "utf-8")
      throw new TypeError("Only utf8 encoding is supported")
    start_read(runtime, destination, path, encoding)
  } else if (name === "promise_resolve" || name === "promise_reject") {
    const argument = alloc_root(memory)
    try {
      if (arguments_.length !== 0) copy_value(memory, argument, arguments_[0])
      if (
        name === "promise_resolve" &&
        kind_of(memory, argument) === KINDS.PROMISE
      ) {
        copy_value(memory, destination, argument)
      } else {
        create_promise(runtime, destination)
        settle_promise(
          runtime,
          destination,
          argument,
          name === "promise_reject",
        )
      }
    } finally {
      free_root(memory, argument)
    }
  } else throw new Error(`Invalid intrinsic ID: ${id}`)
}
