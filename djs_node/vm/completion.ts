import type { Root } from "./memory.ts"
import type { Runtime } from "../runtime/modules.ts"
import { copy_value } from "./memory.ts"
import { write_undefined } from "./values.ts"
import { create_error } from "./objects.ts"

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
  create_error(runtime, runtime.pending_exception, name, message)
  return THROW
}

export function throw_value(runtime: Runtime, value: Root): typeof THROW {
  copy_value(runtime.memory, runtime.pending_exception, value)
  return THROW
}

export function take_exception(runtime: Runtime, destination: Root) {
  copy_value(runtime.memory, destination, runtime.pending_exception)
  clear_exception(runtime)
}

export function clear_exception(runtime: Runtime) {
  write_undefined(runtime.memory, runtime.pending_exception)
}
