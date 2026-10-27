import { panic } from "../../utils.ts"
import type { Handle, Persistent } from "../storage/heap.ts"
import {
  heap_type_of,
  read_boolean,
  read_number,
  write_boolean,
  write_number,
  write_undefined,
  write_uninitialized,
} from "../storage/value.ts"
import { HEAP_TYPES } from "../storage/layout.ts"
import { FUNCTION_DERIVED } from "../../compiler/bytecode.ts"
import type { BindingLocation, FunctionId } from "../../compiler/compile.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import type { CodeId } from "../../runtime/modules.ts"
import { write_string } from "../heap_types/string.ts"
import { has_property_list, set_prototype } from "../heap_types/object.ts"
import {
  BUILTIN_CONSTRUCTOR,
  function_code_id,
  function_flags,
  function_id as callee_function_id,
  load_builtin_steps,
  load_function_environment,
  load_function_new_target,
  load_function_receiver,
} from "../heap_types/function.ts"
import { create_environment } from "../heap_types/environment.ts"
import {
  create_value_array,
  load_value_array_element,
} from "../heap_types/value_array.ts"
import {
  create_arguments_object,
  create_array,
  create_function,
  create_object,
} from "../semantics/objects.ts"
import { define_property, load_property } from "../semantics/properties.ts"
import { initialize_binding } from "../semantics/bindings.ts"
import {
  OK,
  THROW,
  throw_error,
  throw_value,
  take_exception,
} from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"
import { FIBER_STATE, Fiber, Frame } from "./fiber.ts"
import {
  BUILTIN_CODE,
  CALL_ID,
  NATIVE_CODE,
  RESUME_CODE,
  call_native_operation,
} from "./native_operations.ts"
import { run_task } from "./interpreter.ts"

export function create_fiber(
  runtime: Runtime,
  code_id: CodeId,
  environment: Handle,
): Fiber {
  const fiber = new Fiber(
    runtime.fibers.length,
    runtime.heap.handles.persistent(),
    runtime.heap.handles.persistent(),
  )
  push_frame(
    runtime,
    fiber,
    code_id,
    runtime.loader.code[code_id].unit.entry,
    environment,
    undefined,
    [],
    null,
  )
  runtime.fibers.push(fiber)
  return fiber
}

function push_frame(
  runtime: Runtime,
  fiber: Fiber,
  code_id: CodeId,
  function_id: FunctionId,
  environment: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
  destination: Handle | null,
  new_target?: Handle,
) {
  const { heap } = runtime
  const fn = runtime.loader.code[code_id].unit.functions[function_id]
  if (!fn) panic("Invalid function descriptor")
  // The frame owns these handles; pop_frame releases them.
  const env = heap.handles.persistent()
  const this_value = heap.handles.persistent()
  heap.copy_value(env, environment)
  if (receiver !== undefined) heap.copy_value(this_value, receiver)
  const target = heap.handles.persistent()
  if (new_target !== undefined) heap.copy_value(target, new_target)
  const registers: Persistent[] = []
  for (let index = 0; index < fn.slot_count; index++)
    registers.push(heap.handles.persistent())
  const frame = new Frame({
    caller: fiber.frame,
    code_id,
    function_id,
    destination: destination,
    environment: env,
    this_value: this_value,
    new_target: target,
    registers,
  })
  const bind = (location: BindingLocation, value: Handle) => {
    if ("register" in location)
      heap.copy_value(registers[location.register], value)
    else initialize_binding(runtime, env, location.slot, value)
  }
  const { arguments_slot, parameters, rest } = fn
  heap.handles.scope(() => {
    if (arguments_slot !== null) {
      const args = heap.handles.local()
      create_arguments_object(runtime, args, arguments_)
      initialize_binding(runtime, env, arguments_slot, args)
    }
    const empty = heap.handles.local()
    for (let index = 0; index < parameters.length; index++)
      bind(parameters[index], arguments_[index] ?? empty)
    if (rest !== null) {
      const array = heap.handles.local(),
        key = heap.handles.local()
      const start = parameters.length
      const count = Math.max(0, arguments_.length - start)
      create_array(runtime, array, count)
      for (let index = 0; index < count; index++) {
        write_string(heap, key, String(index))
        define_property(runtime, array, key, arguments_[start + index])
      }
      bind(rest, array)
    }
  })
  fiber.frame = frame
}

export function pop_frame(runtime: Runtime, fiber: Fiber) {
  const frame = fiber.frame!
  const { handles } = runtime.heap
  for (const register of frame.registers) handles.release(register)
  handles.release(frame.environment)
  handles.release(frame.this_value)
  handles.release(frame.new_target)
  fiber.frame = frame.caller
}

export function dispose_fiber(runtime: Runtime, fiber: Fiber) {
  if (fiber.status === FIBER_STATE.DISPOSED) return
  while (fiber.frame !== null) pop_frame(runtime, fiber)
  const { handles } = runtime.heap
  handles.release(fiber.result)
  handles.release(fiber.error)
  if (fiber.settle) {
    handles.release(fiber.settle.resolve)
    handles.release(fiber.settle.reject)
    fiber.settle = undefined
  }
  fiber.status = FIBER_STATE.DISPOSED
}

export function call_function(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  callee: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
): Status {
  const { heap } = runtime
  if (
    callee === undefined ||
    heap_type_of(heap, callee) !== HEAP_TYPES.FUNCTION
  )
    return throw_error(runtime, "TypeError", "Value is not callable")
  const code_id = function_code_id(heap, callee),
    function_id = callee_function_id(heap, callee)
  if (code_id === RESUME_CODE) {
    heap.handles.scope(() => {
      const captured = heap.handles.local(),
        value = heap.handles.local()
      load_function_environment(heap, captured, callee)
      load_value_array_element(heap, value, captured, 0)
      const target = read_number(heap, value) as Handle
      load_value_array_element(heap, value, captured, 1)
      resume_fiber(
        runtime,
        runtime.fibers[function_id],
        target,
        arguments_[0],
        read_boolean(heap, value),
      )
      write_undefined(heap, destination)
    })
    return OK
  }
  if (code_id === BUILTIN_CODE)
    return enter_builtin(
      runtime,
      fiber,
      destination,
      callee,
      receiver,
      arguments_,
    )
  if (code_id === NATIVE_CODE && function_id === CALL_ID)
    return call_function(
      runtime,
      fiber,
      destination,
      arguments_[0],
      arguments_[1],
      arguments_.slice(2),
    )
  if (code_id === NATIVE_CODE)
    return call_native_operation(runtime, function_id, destination, arguments_)
  if (runtime.loader.code[code_id].unit.functions[function_id].flags & 8)
    return call_async_function(
      runtime,
      destination,
      callee,
      receiver,
      arguments_,
    )
  return enter_function(
    runtime,
    fiber,
    destination,
    callee,
    receiver,
    arguments_,
  )
}

function enter_function(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  callee: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
  target?: Handle,
): Status {
  const { heap } = runtime
  const code_id = function_code_id(heap, callee),
    function_id = callee_function_id(heap, callee)
  return heap.handles.scope(() => {
    const parent = heap.handles.local(),
      environment = heap.handles.local(),
      this_value = heap.handles.local(),
      new_target = heap.handles.local()
    load_function_environment(heap, parent, callee)
    const fn = runtime.loader.code[code_id].unit.functions[function_id]
    const flags = function_flags(heap, callee)
    if (flags & 1)
      return throw_error(runtime, "TypeError", "Class constructor requires new")
    if (flags & 4) {
      load_function_receiver(heap, this_value, callee)
      receiver = this_value
      load_function_new_target(heap, new_target, callee)
    }
    if (target !== undefined) heap.copy_value(new_target, target)
    create_environment(
      heap,
      environment,
      parent,
      fn.binding_count,
      runtime.loader.code[code_id].scope_ids[function_id],
    )
    push_frame(
      runtime,
      fiber,
      code_id,
      function_id,
      environment,
      receiver,
      arguments_,
      destination,
      new_target,
    )
    return OK
  })
}

export function coerce_value(
  runtime: Runtime,
  destination: Handle,
  source: Handle,
  operation: string,
  hint?: string,
): Status {
  const helper = runtime.realm.intrinsics.get(operation)
  if (helper === undefined) {
    runtime.heap.copy_value(destination, source)
    return OK
  }
  return runtime.heap.handles.scope(() => {
    const hint_value = runtime.heap.handles.local()
    if (hint !== undefined) write_string(runtime.heap, hint_value, hint)
    return invoke_sync(runtime, destination, helper, undefined, [
      source,
      hint_value,
    ])
  })
}

// A synchronous language operation may execute user code (valueOf/toString).
// Keep that execution in a VM fiber and preserve thrown guest values.
export function invoke_sync(
  runtime: Runtime,
  destination: Handle,
  callee: Handle,
  receiver: Handle | undefined,
  args: Handle[],
): Status {
  const fiber = create_call_fiber(runtime, callee, receiver, args)
  try {
    run_task(runtime, fiber)
    if (fiber.status === FIBER_STATE.FAILED)
      return throw_value(runtime, fiber.error)
    if (fiber.status !== FIBER_STATE.DONE)
      panic("Internal operations must complete synchronously")
    runtime.heap.copy_value(destination, fiber.result)
    return OK
  } finally {
    dispose_fiber(runtime, fiber)
  }
}

/**
 * Makes `fiber` settle a new %Promise%, written to `promise`, when it
 * finishes. Async function calls and module evaluations both work this way.
 */
export function settle_with_promise(
  runtime: Runtime,
  fiber: Fiber,
  promise: Handle,
): Status {
  const new_capability = runtime.realm.intrinsics.get("NewPromiseCapability")
  if (new_capability === undefined) panic("Promise is not initialized")
  const { heap } = runtime
  const capability = create_call_fiber(runtime, new_capability, undefined, [])
  try {
    run_task(runtime, capability)
    if (capability.status === FIBER_STATE.FAILED)
      return throw_value(runtime, capability.error)
    // The fiber owns these until dispose_fiber releases them.
    const resolve = heap.handles.persistent(),
      reject = heap.handles.persistent()
    fiber.settle = { resolve, reject }
    heap.handles.scope(() => {
      const key = heap.handles.local()
      for (const [name, target] of [
        ["promise", promise],
        ["resolve", resolve],
        ["reject", reject],
      ] as [string, Handle][]) {
        write_string(heap, key, name)
        load_property(runtime, target, capability.result, key)
      }
    })
    return OK
  } finally {
    dispose_fiber(runtime, capability)
  }
}

// Each async call runs in its own fiber, so AWAIT suspends only that call.
function call_async_function(
  runtime: Runtime,
  destination: Handle,
  callee: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
): Status {
  const fiber = create_empty_fiber(runtime)
  if (settle_with_promise(runtime, fiber, destination) === THROW) {
    dispose_fiber(runtime, fiber)
    return THROW
  }
  if (
    enter_function(
      runtime,
      fiber,
      fiber.result,
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, fiber.error)
    fiber.status = FIBER_STATE.FAILED
  }
  run_task(runtime, fiber)
  return OK
}

export function settle_fiber(runtime: Runtime, fiber: Fiber) {
  const { resolve, reject } = fiber.settle!
  const fulfilled = fiber.status === FIBER_STATE.DONE
  let settlement
  try {
    settlement = create_call_fiber(
      runtime,
      fulfilled ? resolve : reject,
      undefined,
      [fulfilled ? fiber.result : fiber.error],
    )
    run_task(runtime, settlement)
  } finally {
    if (settlement) dispose_fiber(runtime, settlement)
    dispose_fiber(runtime, fiber)
  }
}

function create_empty_fiber(runtime: Runtime): Fiber {
  const fiber = new Fiber(
    runtime.fibers.length,
    runtime.heap.handles.persistent(),
    runtime.heap.handles.persistent(),
  )
  runtime.fibers.push(fiber)
  return fiber
}

export function create_call_fiber(
  runtime: Runtime,
  callee: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
): Fiber {
  const fiber = create_empty_fiber(runtime)
  if (
    call_function(
      runtime,
      fiber,
      fiber.result,
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, fiber.error)
    fiber.status = FIBER_STATE.FAILED
  } else if (fiber.frame === null) fiber.status = FIBER_STATE.DONE
  return fiber
}

export function resume_fiber(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  argument: Handle | undefined,
  rejected: boolean,
) {
  if (fiber.status !== FIBER_STATE.WAITING) return
  if (argument !== undefined)
    runtime.heap.copy_value(rejected ? fiber.error : destination, argument)
  else write_undefined(runtime.heap, rejected ? fiber.error : destination)
  fiber.await_rejected = rejected
  fiber.status = FIBER_STATE.READY
}

// [[Call]] and [[Construct]] of built-in function objects (ECMA-262 10.3.1,
// 10.3.2) both run the function's steps; construction passes new.target and
// no receiver, and the steps return the new object.
function enter_builtin(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  callee: Handle,
  receiver: Handle | undefined,
  arguments_: Handle[],
  new_target?: Handle,
): Status {
  return runtime.heap.handles.scope(() => {
    const steps = runtime.heap.handles.local()
    if (!load_builtin_steps(runtime.heap, steps, callee))
      panic("Built-in function has no steps")
    return enter_function(
      runtime,
      fiber,
      destination,
      steps,
      receiver,
      arguments_,
      new_target,
    )
  })
}

export function construct_function(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  callee: Handle,
  arguments_: Handle[],
  new_target: Handle = callee,
): Status {
  const { heap } = runtime
  if (heap_type_of(heap, callee) !== HEAP_TYPES.FUNCTION)
    return throw_error(runtime, "TypeError", "Value is not a constructor")
  const code = function_code_id(heap, callee),
    id = callee_function_id(heap, callee)
  if (code === BUILTIN_CODE) {
    if (!(function_flags(heap, callee) & BUILTIN_CONSTRUCTOR))
      return throw_error(runtime, "TypeError", "Value is not a constructor")
    return enter_builtin(
      runtime,
      fiber,
      destination,
      callee,
      undefined,
      arguments_,
      new_target,
    )
  }
  if (
    code === NATIVE_CODE ||
    code === RESUME_CODE ||
    runtime.loader.code[code].unit.functions[id].flags & 14
  )
    return throw_error(runtime, "TypeError", "Value is not a constructor")
  return heap.handles.scope(() => {
    const receiver = heap.handles.local(),
      key = heap.handles.local(),
      prototype = heap.handles.local(),
      parent = heap.handles.local(),
      environment = heap.handles.local()
    load_function_environment(heap, parent, callee)
    const { unit, scope_ids } = runtime.loader.code[code],
      fn = unit.functions[id]
    if (fn.flags & FUNCTION_DERIVED) {
      // A derived constructor's this is bound by its super() call.
      write_uninitialized(heap, receiver)
    } else {
      create_object(runtime, receiver)
      // Constructors in the supported subset have data-valued prototype properties.
      write_string(heap, key, "prototype")
      load_property(runtime, prototype, new_target, key)
      if (has_property_list(heap, prototype))
        set_prototype(heap, receiver, prototype)
    }
    create_environment(
      heap,
      environment,
      parent,
      fn.binding_count,
      scope_ids[id],
    )
    push_frame(
      runtime,
      fiber,
      code,
      id,
      environment,
      receiver,
      arguments_,
      destination,
      new_target,
    )
    fiber.frame!.is_construct_call = true
    return OK
  })
}

function resume_function(
  runtime: Runtime,
  destination: Handle,
  fiber: Fiber,
  awaiting: Handle,
  rejected: boolean,
) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const target = heap.handles.local(),
      flag = heap.handles.local(),
      captured = heap.handles.local()
    write_number(heap, target, awaiting)
    write_boolean(heap, flag, rejected)
    create_value_array(heap, captured, [target, flag])
    create_function(runtime, destination, RESUME_CODE, fiber.id, captured, 2)
  })
}

export function await_value(
  runtime: Runtime,
  fiber: Fiber,
  destination: Handle,
  source: Handle,
) {
  const await_promise = runtime.realm.intrinsics.get("Await")
  if (await_promise === undefined) panic("Promise is not initialized")
  const { heap } = runtime
  fiber.status = FIBER_STATE.WAITING
  heap.handles.scope(() => {
    const fulfilled = heap.handles.local(),
      rejected = heap.handles.local()
    let registration
    try {
      resume_function(runtime, fulfilled, fiber, destination, false)
      resume_function(runtime, rejected, fiber, destination, true)
      registration = create_call_fiber(runtime, await_promise, undefined, [
        source,
        fulfilled,
        rejected,
      ])
      run_task(runtime, registration)
      if (registration.status === FIBER_STATE.FAILED)
        resume_fiber(runtime, fiber, destination, registration.error, true)
    } finally {
      if (registration) dispose_fiber(runtime, registration)
    }
  })
}
