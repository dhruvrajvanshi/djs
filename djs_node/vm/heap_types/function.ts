import type { Heap } from "../storage/heap.ts"
import type { Handle } from "../storage/heap.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { FUNCTION, HEAP_TYPES } from "../storage/layout.ts"
import type { FunctionId } from "../../compiler/compile.ts"
import type { CodeId } from "../../runtime/modules.ts"

/** A built-in function whose steps also implement [[Construct]]. */
export const BUILTIN_CONSTRUCTOR = 32

/** An undefined prototype means null. */
export function allocate_function(
  heap: Heap,
  destination: Handle,
  prototype: Handle | undefined,
  code_id: number,
  function_id: number,
  environment?: Handle,
  flags: number = 0,
  receiver?: Handle,
  new_target?: Handle,
) {
  const reference = heap.allocate(HEAP_TYPES.FUNCTION, 48)
  set_ref(heap, destination, reference)
  heap.write_u32(reference + FUNCTION.CODE, code_id)
  heap.write_u32(reference + FUNCTION.ID, function_id)
  heap.write_u32(reference + FUNCTION.FLAGS, flags)
  if (prototype !== undefined)
    heap.write_u32(reference + FUNCTION.PROTOTYPE, get_ref(heap, prototype))
  if (receiver !== undefined)
    heap.store_value(reference + FUNCTION.RECEIVER, receiver)
  if (environment !== undefined)
    heap.store_value(reference + FUNCTION.ENVIRONMENT, environment)
  if (new_target !== undefined)
    heap.store_value(reference + FUNCTION.NEW_TARGET, new_target)
}

export function function_code_id(heap: Heap, callee: Handle): CodeId {
  return heap.read_u32(get_ref(heap, callee) + FUNCTION.CODE) as CodeId
}

export function function_id(heap: Heap, callee: Handle): FunctionId {
  return heap.read_u32(get_ref(heap, callee) + FUNCTION.ID) as FunctionId
}

export function function_flags(heap: Heap, callee: Handle): number {
  return heap.read_u32(get_ref(heap, callee) + FUNCTION.FLAGS)
}

/** Stores a built-in function's specification steps (ECMA-262 10.3). */
export function set_builtin_steps(
  heap: Heap,
  callee: Handle,
  steps: Handle,
  constructor: boolean,
) {
  const reference = get_ref(heap, callee)
  heap.write_u32(reference + FUNCTION.STEPS, get_ref(heap, steps))
  if (constructor)
    heap.write_u32(
      reference + FUNCTION.FLAGS,
      heap.read_u32(reference + FUNCTION.FLAGS) | BUILTIN_CONSTRUCTOR,
    )
}

export function load_builtin_steps(
  heap: Heap,
  destination: Handle,
  callee: Handle,
) {
  const steps = heap.read_u32(get_ref(heap, callee) + FUNCTION.STEPS)
  if (steps !== 0) set_ref(heap, destination, steps)
  return steps !== 0
}

export function load_function_environment(
  heap: Heap,
  destination: Handle,
  callee: Handle,
) {
  heap.load_value(destination, get_ref(heap, callee) + FUNCTION.ENVIRONMENT)
}

export function load_function_receiver(
  heap: Heap,
  destination: Handle,
  callee: Handle,
) {
  heap.load_value(destination, get_ref(heap, callee) + FUNCTION.RECEIVER)
}

export function load_function_new_target(
  heap: Heap,
  destination: Handle,
  callee: Handle,
) {
  heap.load_value(destination, get_ref(heap, callee) + FUNCTION.NEW_TARGET)
}
