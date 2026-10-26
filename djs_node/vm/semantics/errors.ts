import type { Root } from "../storage/value.ts"
import { write_undefined } from "../storage/value.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import { write_string } from "../records/string.ts"
import { invoke_sync } from "../execution/calls.ts"
import { panic } from "../../utils.ts"

/**
 * Operations that guest code can observe failing return a Status. On THROW,
 * the thrown value is in runtime.pending_exception until a caller takes it.
 */
export const OK = 0
export const THROW = 1
export type Status = typeof OK | typeof THROW

export function throw_error(
  runtime: Runtime,
  name: string,
  message: string,
): typeof THROW {
  const error = runtime.memory.alloc_root()
  try {
    create_error(runtime, error, name, message)
    return throw_value(runtime, error)
  } finally {
    runtime.memory.free_root(error)
  }
}

/** Calls the registered %name% constructor. A throwing constructor's exception is the result. */
export function create_error(
  runtime: Runtime,
  destination: Root,
  name: string,
  message: string,
) {
  const constructor = runtime.realm.intrinsics.get(`%${name}%`)
  // Errors can only reach guest code once the stdlib has registered them.
  if (constructor === undefined) panic(`${name}: ${message}`)
  const text = runtime.memory.alloc_root()
  try {
    write_string(runtime.memory, text, message)
    if (
      invoke_sync(runtime, destination, constructor, undefined, [text]) ===
      THROW
    )
      take_exception(runtime, destination)
  } finally {
    runtime.memory.free_root(text)
  }
}

export function throw_value(runtime: Runtime, value: Root): typeof THROW {
  runtime.memory.copy_value(runtime.pending_exception, value)
  return THROW
}

export function take_exception(runtime: Runtime, destination: Root) {
  runtime.memory.copy_value(destination, runtime.pending_exception)
  clear_exception(runtime)
}

export function clear_exception(runtime: Runtime) {
  write_undefined(runtime.memory, runtime.pending_exception)
}
