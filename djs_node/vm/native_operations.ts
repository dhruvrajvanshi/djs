import { panic } from "../utils.ts"
import type { Handle } from "./storage/heap.ts"
import { write_undefined } from "./storage/value.ts"
import type { Runtime } from "../runtime/runtime.ts"
import { OK } from "./errors.ts"
import type { Status } from "./errors.ts"
import { VM_PRIMITIVES, VM_VALUES } from "../builtin_modules/djs_vm.ts"
import { RUNTIME_OPERATIONS } from "../builtin_modules/djs_runtime.ts"

export const NATIVE_CODE = 0xffffffff
/** Built-in function objects run the steps stored by set_builtin_steps. */
export const BUILTIN_CODE = 0xfffffffd
export const RESUME_CODE = 0xfffffffe

/**
 * A function exported by a native module. Writes its result to
 * `destination`, or raises and returns `THROW`.
 */
export type NativeOperation = (
  runtime: Runtime,
  destination: Handle,
  arguments_: Handle[],
) => Status

/** A value exported by a native module, written once when the module loads. */
export type NativeValue = (runtime: Runtime, destination: Handle) => void

// Each module's operations, in one table. A name's position here is its
// operation ID.
let operations: Record<string, NativeOperation> | undefined
function native_operations() {
  return (operations ??= {
    ...VM_PRIMITIVES,
    ...RUNTIME_OPERATIONS,
    /** %Function.prototype%'s behavior: accepts any arguments, returns undefined. */
    function_prototype(runtime, destination) {
      write_undefined(runtime.heap, destination)
      return OK
    },
  })
}

export interface NativeModule {
  /** Exported operations, by name, mapped to their operation IDs. */
  operations: Map<string, number>
  /** Exported values, by name. */
  values: Readonly<Record<string, NativeValue>>
}

let modules: ReadonlyMap<string, NativeModule> | undefined
/** The native modules, by specifier. See docs/native-modules.md. */
export function native_modules() {
  return (modules ??= new Map([
    ["djs:vm", native_module(Object.keys(VM_PRIMITIVES), VM_VALUES)],
    ["djs:runtime", native_module(Object.keys(RUNTIME_OPERATIONS))],
  ]))
}

function native_module(
  names: readonly string[],
  values: Readonly<Record<string, NativeValue>> = {},
): NativeModule {
  return {
    operations: new Map(names.map((name) => [name, native_operation_id(name)])),
    values,
  }
}

export function native_operation_id(name: string) {
  const id = Object.keys(native_operations()).indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown native operation: ${name}`)
  return id
}

export function call_id() {
  return native_operation_id("call")
}

export function call_native_operation(
  runtime: Runtime,
  id: number,
  destination: Handle,
  arguments_: Handle[],
): Status {
  const operation = Object.values(native_operations())[id]
  if (operation === undefined) panic(`Invalid native operation ID: ${id}`)
  return operation(runtime, destination, arguments_)
}
