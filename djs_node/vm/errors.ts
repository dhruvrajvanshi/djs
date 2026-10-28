import type { JSValue } from "./storage/heap.ts"
import { write_undefined } from "./storage/value.ts"
import type { Runtime } from "../runtime/runtime.ts"
import { write_string } from "./heap_types/string.ts"
import { allocate_object, mark_error_object } from "./heap_types/object.ts"
import { define_property } from "./properties.ts"
import { stack_trace } from "../builtin_modules/djs_vm.ts"
import { panic } from "../utils.ts"

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
  return runtime.heap.handles.scope(() => {
    const error = runtime.heap.handles.local()
    create_error(runtime, error, name, message)
    return throw_value(runtime, error)
  })
}

/**
 * Creates an error from the intrinsic %name.prototype%, with the `message` and
 * `stack` the stdlib's error constructors give it.
 */
export function create_error(
  runtime: Runtime,
  destination: JSValue,
  name: string,
  message: string,
) {
  const { heap } = runtime
  const prototype = runtime.realm.error_prototype(name)
  if (prototype === undefined) panic(`${name}: ${message}`)
  allocate_object(heap, destination, prototype)
  mark_error_object(heap, destination)
  heap.handles.scope(() => {
    const value = heap.handles.local()
    write_string(heap, value, message)
    define_property(runtime, destination, "message", {
      value,
      writable: true,
      configurable: true,
    })
    const summary = message === "" ? name : `${name}: ${message}`
    write_string(heap, value, summary + stack_trace(runtime))
    define_property(runtime, destination, "stack", {
      value,
      writable: true,
      configurable: true,
    })
  })
}

export function throw_value(runtime: Runtime, value: JSValue): typeof THROW {
  runtime.heap.copy_value(runtime.pending_exception, value)
  return THROW
}

export function take_exception(runtime: Runtime, destination: JSValue) {
  runtime.heap.copy_value(destination, runtime.pending_exception)
  clear_exception(runtime)
}

export function clear_exception(runtime: Runtime) {
  write_undefined(runtime.heap, runtime.pending_exception)
}
