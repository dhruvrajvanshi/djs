import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { FUNCTION, KINDS } from "../storage/layout.ts"
import type { FunctionId } from "../../compiler/compile.ts"
import type { CodeId } from "../../runtime/modules.ts"

/** A built-in function whose steps also implement [[Construct]]. */
export const BUILTIN_CONSTRUCTOR = 32

/** An undefined prototype means null. */
export function allocate_function(
  memory: Memory,
  destination: Root,
  prototype: Root | undefined,
  code_id: number,
  function_id: number,
  environment?: Root,
  flags: number = 0,
  receiver?: Root,
  new_target?: Root,
) {
  const reference = memory.allocate(KINDS.FUNCTION, 48)
  set_ref(memory, destination, reference)
  memory.write_u32(reference + FUNCTION.CODE, code_id)
  memory.write_u32(reference + FUNCTION.ID, function_id)
  memory.write_u32(reference + FUNCTION.FLAGS, flags)
  if (prototype !== undefined)
    memory.write_u32(reference + FUNCTION.PROTOTYPE, get_ref(memory, prototype))
  if (receiver !== undefined)
    memory.copy_root_to_heap_value(reference + FUNCTION.RECEIVER, receiver)
  if (environment !== undefined)
    memory.copy_root_to_heap_value(
      reference + FUNCTION.ENVIRONMENT,
      environment,
    )
  if (new_target !== undefined)
    memory.copy_root_to_heap_value(reference + FUNCTION.NEW_TARGET, new_target)
}

export function function_code_id(memory: Memory, callee: Root): CodeId {
  return memory.read_u32(get_ref(memory, callee) + FUNCTION.CODE) as CodeId
}

export function function_id(memory: Memory, callee: Root): FunctionId {
  return memory.read_u32(get_ref(memory, callee) + FUNCTION.ID) as FunctionId
}

export function function_flags(memory: Memory, callee: Root): number {
  return memory.read_u32(get_ref(memory, callee) + FUNCTION.FLAGS)
}

/** Stores a built-in function's specification steps (ECMA-262 10.3). */
export function set_builtin_steps(
  memory: Memory,
  callee: Root,
  steps: Root,
  constructor: boolean,
) {
  const reference = get_ref(memory, callee)
  memory.write_u32(reference + FUNCTION.STEPS, get_ref(memory, steps))
  if (constructor)
    memory.write_u32(
      reference + FUNCTION.FLAGS,
      memory.read_u32(reference + FUNCTION.FLAGS) | BUILTIN_CONSTRUCTOR,
    )
}

export function load_builtin_steps(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  const steps = memory.read_u32(get_ref(memory, callee) + FUNCTION.STEPS)
  if (steps !== 0) set_ref(memory, destination, steps)
  return steps !== 0
}

export function load_function_environment(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(
    destination,
    get_ref(memory, callee) + FUNCTION.ENVIRONMENT,
  )
}

export function load_function_receiver(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(
    destination,
    get_ref(memory, callee) + FUNCTION.RECEIVER,
  )
}

export function load_function_new_target(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(
    destination,
    get_ref(memory, callee) + FUNCTION.NEW_TARGET,
  )
}
