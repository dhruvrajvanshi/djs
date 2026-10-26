import { panic } from "../../utils.ts"
import type { Root } from "../storage/value.ts"
import {
  kind_of,
  read_boolean,
  read_number,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import type { BindingLocation, FunctionId } from "../../compiler/compile.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import type { CodeId } from "../../runtime/modules.ts"
import { MODULE_STATE } from "../../runtime/modules.ts"
import { write_string } from "../records/string.ts"
import { has_property_list, set_prototype } from "../records/object.ts"
import {
  BUILTIN_CONSTRUCTOR,
  function_code_id,
  function_flags,
  function_id as callee_function_id,
  load_builtin_steps,
  load_function_environment,
  load_function_new_target,
  load_function_receiver,
} from "../records/function.ts"
import { create_environment } from "../records/environment.ts"
import {
  create_value_array,
  load_value_array_element,
} from "../records/value_array.ts"
import {
  create_arguments_object,
  create_array,
  create_function,
  create_object,
} from "../semantics/objects.ts"
import { define_property, get_property } from "../semantics/properties.ts"
import { initialize_binding } from "../semantics/bindings.ts"
import {
  OK,
  THROW,
  throw_error,
  throw_value,
  take_exception,
} from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"
import { CONTEXT_STATE, Context, Frame } from "./context.ts"
import {
  BUILTIN_CODE,
  CALL_ID,
  NATIVE_CODE,
  RESUME_CODE,
  call_intrinsic,
} from "./intrinsics.ts"
import { run_task } from "./interpreter.ts"

export function create_context(
  runtime: Runtime,
  code_id: CodeId,
  environment: Root,
): Context {
  const context = new Context(
    runtime.contexts.length,
    runtime.memory.alloc_root(),
    runtime.memory.alloc_root(),
  )
  push_frame(
    runtime,
    context,
    code_id,
    runtime.loader.code[code_id].unit.entry,
    environment,
    undefined,
    [],
    null,
  )
  runtime.contexts.push(context)
  return context
}

function push_frame(
  runtime: Runtime,
  context: Context,
  code_id: CodeId,
  function_id: FunctionId,
  environment: Root,
  receiver: Root | undefined,
  arguments_: Root[],
  destination: Root | null,
  new_target?: Root,
) {
  const { memory } = runtime
  const fn = runtime.loader.code[code_id].unit.functions[function_id]
  if (!fn) panic("Invalid function descriptor")
  const env = memory.alloc_root()
  const this_value = memory.alloc_root()
  memory.copy_value(env, environment)
  if (receiver !== undefined) memory.copy_value(this_value, receiver)
  const target = memory.alloc_root()
  if (new_target !== undefined) memory.copy_value(target, new_target)
  const registers: Root[] = []
  for (let index = 0; index < fn.slot_count; index++)
    registers.push(memory.alloc_root())
  const frame = new Frame({
    caller: context.frame,
    code_id,
    function_id,
    return_root: destination,
    environment_root: env,
    this_root: this_value,
    new_target_root: target,
    registers,
  })
  const bind = (location: BindingLocation, value: Root) => {
    if ("register" in location)
      memory.copy_value(registers[location.register], value)
    else initialize_binding(runtime, env, location.slot, value)
  }
  if (fn.arguments_slot !== null) {
    const args = memory.alloc_root()
    try {
      create_arguments_object(runtime, args, arguments_)
      initialize_binding(runtime, env, fn.arguments_slot, args)
    } finally {
      memory.free_root(args)
    }
  }
  for (let index = 0; index < fn.parameters.length; index++) {
    const argument = arguments_[index]
    if (argument === undefined) {
      const empty = memory.alloc_root()
      try {
        bind(fn.parameters[index], empty)
      } finally {
        memory.free_root(empty)
      }
    } else bind(fn.parameters[index], argument)
  }
  if (fn.rest !== null) {
    const rest = memory.alloc_root(),
      key = memory.alloc_root()
    try {
      const start = fn.parameters.length
      const count = Math.max(0, arguments_.length - start)
      create_array(runtime, rest, count)
      for (let index = 0; index < count; index++) {
        write_string(memory, key, String(index))
        define_property(runtime, rest, key, arguments_[start + index])
      }
      bind(fn.rest, rest)
    } finally {
      memory.free_root(rest)
      memory.free_root(key)
    }
  }
  context.frame = frame
}

export function pop_frame(runtime: Runtime, context: Context) {
  const frame = context.frame!
  for (const register of frame.registers) runtime.memory.free_root(register)
  runtime.memory.free_root(frame.environment_root)
  runtime.memory.free_root(frame.this_root)
  runtime.memory.free_root(frame.new_target_root)
  context.frame = frame.caller
}

export function dispose_context(runtime: Runtime, context: Context) {
  if (context.status === CONTEXT_STATE.DISPOSED) return
  while (context.frame !== null) pop_frame(runtime, context)
  runtime.memory.free_root(context.result)
  runtime.memory.free_root(context.error)
  context.status = CONTEXT_STATE.DISPOSED
}

export function call_function(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
): Status {
  const { memory } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    return throw_error(runtime, "TypeError", "Value is not callable")
  const code_id = function_code_id(memory, callee),
    function_id = callee_function_id(memory, callee)
  if (code_id === RESUME_CODE) {
    const captured = memory.alloc_root(),
      value = memory.alloc_root()
    try {
      load_function_environment(memory, captured, callee)
      load_value_array_element(memory, value, captured, 0)
      const target = read_number(memory, value) as Root
      load_value_array_element(memory, value, captured, 1)
      resume_context(
        runtime,
        runtime.contexts[function_id],
        target,
        arguments_[0],
        read_boolean(memory, value),
      )
      write_undefined(memory, destination)
    } finally {
      memory.free_root(captured)
      memory.free_root(value)
    }
    return OK
  }
  if (code_id === BUILTIN_CODE)
    return enter_builtin(
      runtime,
      context,
      destination,
      callee,
      receiver,
      arguments_,
    )
  if (code_id === NATIVE_CODE && function_id === CALL_ID)
    return call_function(
      runtime,
      context,
      destination,
      arguments_[0],
      arguments_[1],
      arguments_.slice(2),
    )
  if (code_id === NATIVE_CODE)
    return call_intrinsic(runtime, function_id, destination, arguments_)
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
    context,
    destination,
    callee,
    receiver,
    arguments_,
  )
}

function enter_function(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
  target?: Root,
): Status {
  const { memory } = runtime
  const code_id = function_code_id(memory, callee),
    function_id = callee_function_id(memory, callee)
  const parent = memory.alloc_root(),
    environment = memory.alloc_root(),
    this_value = memory.alloc_root(),
    new_target = memory.alloc_root()
  try {
    load_function_environment(memory, parent, callee)
    const fn = runtime.loader.code[code_id].unit.functions[function_id]
    const flags = function_flags(memory, callee)
    if (flags & 1)
      return throw_error(runtime, "TypeError", "Class constructor requires new")
    if (flags & 4) {
      load_function_receiver(memory, this_value, callee)
      receiver = this_value
      load_function_new_target(memory, new_target, callee)
    }
    if (target !== undefined) memory.copy_value(new_target, target)
    create_environment(
      memory,
      environment,
      parent,
      fn.binding_count,
      runtime.loader.code[code_id].scope_ids[function_id],
    )
    push_frame(
      runtime,
      context,
      code_id,
      function_id,
      environment,
      receiver,
      arguments_,
      destination,
      new_target,
    )
    return OK
  } finally {
    memory.free_root(new_target)
    memory.free_root(parent)
    memory.free_root(environment)
    memory.free_root(this_value)
  }
}

export function coerce_value(
  runtime: Runtime,
  destination: Root,
  source: Root,
  operation: string,
  hint?: string,
): Status {
  const helper = runtime.realm.intrinsics.get(operation)
  if (helper === undefined) {
    runtime.memory.copy_value(destination, source)
    return OK
  }
  const hint_value = runtime.memory.alloc_root()
  try {
    if (hint !== undefined) write_string(runtime.memory, hint_value, hint)
    return invoke_sync(runtime, destination, helper, undefined, [
      source,
      hint_value,
    ])
  } finally {
    runtime.memory.free_root(hint_value)
  }
}

// A synchronous language operation may execute user code (valueOf/toString).
// Keep that execution in a rooted VM context and preserve thrown guest values.
export function invoke_sync(
  runtime: Runtime,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  args: Root[],
): Status {
  const context = create_call_context(runtime, callee, receiver, args)
  try {
    run_task(runtime, context)
    if (context.status === CONTEXT_STATE.FAILED)
      return throw_value(runtime, context.error)
    if (context.status !== CONTEXT_STATE.DONE)
      panic("Internal operations must complete synchronously")
    runtime.memory.copy_value(destination, context.result)
    return OK
  } finally {
    dispose_context(runtime, context)
  }
}

// Each async call runs in its own context, so AWAIT suspends only that call.
function call_async_function(
  runtime: Runtime,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
): Status {
  const new_capability = runtime.realm.intrinsics.get("NewPromiseCapability")
  if (new_capability === undefined) panic("Promise is not initialized")
  const { memory } = runtime
  const key = memory.alloc_root(),
    resolve = memory.alloc_root(),
    reject = memory.alloc_root()
  const capability = create_call_context(runtime, new_capability, undefined, [])
  try {
    run_task(runtime, capability)
    if (capability.status === CONTEXT_STATE.FAILED) {
      memory.free_root(resolve)
      memory.free_root(reject)
      return throw_value(runtime, capability.error)
    }
    for (const [name, target] of [
      ["promise", destination],
      ["resolve", resolve],
      ["reject", reject],
    ] as [string, Root][]) {
      write_string(memory, key, name)
      get_property(runtime, target, capability.result, key)
    }
  } finally {
    dispose_context(runtime, capability)
    memory.free_root(key)
  }
  const context = create_empty_context(runtime)
  context.settle = { resolve, reject }
  if (
    enter_function(
      runtime,
      context,
      context.result,
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, context.error)
    context.status = CONTEXT_STATE.FAILED
  }
  run_task(runtime, context)
  return OK
}

export function settle_async_function(runtime: Runtime, context: Context) {
  const { resolve, reject } = context.settle!
  context.settle = undefined
  const fulfilled = context.status === CONTEXT_STATE.DONE
  let settlement
  try {
    settlement = create_call_context(
      runtime,
      fulfilled ? resolve : reject,
      undefined,
      [fulfilled ? context.result : context.error],
    )
    run_task(runtime, settlement)
  } finally {
    if (settlement) dispose_context(runtime, settlement)
    dispose_context(runtime, context)
    runtime.memory.free_root(resolve)
    runtime.memory.free_root(reject)
  }
}

function create_empty_context(runtime: Runtime): Context {
  const context = new Context(
    runtime.contexts.length,
    runtime.memory.alloc_root(),
    runtime.memory.alloc_root(),
  )
  runtime.contexts.push(context)
  return context
}

export function create_call_context(
  runtime: Runtime,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
): Context {
  const context = create_empty_context(runtime)
  if (
    call_function(
      runtime,
      context,
      context.result,
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, context.error)
    context.status = CONTEXT_STATE.FAILED
  } else if (context.frame === null) context.status = CONTEXT_STATE.DONE
  return context
}

export function resume_context(
  runtime: Runtime,
  context: Context,
  destination: Root,
  argument: Root | undefined,
  rejected: boolean,
) {
  if (context.status !== CONTEXT_STATE.WAITING) return
  if (argument !== undefined)
    runtime.memory.copy_value(rejected ? context.error : destination, argument)
  else write_undefined(runtime.memory, rejected ? context.error : destination)
  context.await_rejected = rejected
  context.status = CONTEXT_STATE.READY
}

// [[Call]] and [[Construct]] of built-in function objects (ECMA-262 10.3.1,
// 10.3.2) both run the function's steps; construction passes new.target and
// no receiver, and the steps return the new object.
function enter_builtin(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
  new_target?: Root,
): Status {
  const steps = runtime.memory.alloc_root()
  try {
    if (!load_builtin_steps(runtime.memory, steps, callee))
      panic("Built-in function has no steps")
    return enter_function(
      runtime,
      context,
      destination,
      steps,
      receiver,
      arguments_,
      new_target,
    )
  } finally {
    runtime.memory.free_root(steps)
  }
}

export function construct_function(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  arguments_: Root[],
): Status {
  const { memory } = runtime
  if (kind_of(memory, callee) !== KINDS.FUNCTION)
    return throw_error(runtime, "TypeError", "Value is not a constructor")
  const code = function_code_id(memory, callee),
    id = callee_function_id(memory, callee)
  if (code === BUILTIN_CODE) {
    if (!(function_flags(memory, callee) & BUILTIN_CONSTRUCTOR))
      return throw_error(runtime, "TypeError", "Value is not a constructor")
    return enter_builtin(
      runtime,
      context,
      destination,
      callee,
      undefined,
      arguments_,
      callee,
    )
  }
  if (
    code === NATIVE_CODE ||
    code === RESUME_CODE ||
    runtime.loader.code[code].unit.functions[id].flags & 14
  )
    return throw_error(runtime, "TypeError", "Value is not a constructor")
  const receiver = memory.alloc_root(),
    key = memory.alloc_root(),
    prototype = memory.alloc_root(),
    parent = memory.alloc_root(),
    environment = memory.alloc_root()
  try {
    load_function_environment(memory, parent, callee)
    const { unit, scope_ids } = runtime.loader.code[code],
      fn = unit.functions[id]
    create_object(runtime, receiver)
    // Constructors in the supported subset have data-valued prototype properties.
    write_string(memory, key, "prototype")
    get_property(runtime, prototype, callee, key)
    if (has_property_list(memory, prototype))
      set_prototype(memory, receiver, prototype)
    create_environment(
      memory,
      environment,
      parent,
      fn.binding_count,
      scope_ids[id],
    )
    push_frame(
      runtime,
      context,
      code,
      id,
      environment,
      receiver,
      arguments_,
      destination,
      callee,
    )
    context.frame!.is_construct_call = true
    return OK
  } finally {
    for (const root of [receiver, key, prototype, parent, environment])
      memory.free_root(root)
  }
}

function resume_function(
  runtime: Runtime,
  destination: Root,
  context: Context,
  destination_root: Root,
  rejected: boolean,
) {
  const { memory } = runtime
  const target = memory.alloc_root(),
    flag = memory.alloc_root(),
    captured = memory.alloc_root()
  try {
    write_number(memory, target, destination_root)
    write_boolean(memory, flag, rejected)
    create_value_array(memory, captured, [target, flag])
    create_function(runtime, destination, RESUME_CODE, context.id, captured, 2)
  } finally {
    for (const root of [target, flag, captured]) memory.free_root(root)
  }
}

export function await_value(
  runtime: Runtime,
  context: Context,
  destination: Root,
  source: Root,
) {
  const await_promise = runtime.realm.intrinsics.get("Await")
  if (await_promise === undefined) panic("Promise is not initialized")
  const { memory } = runtime
  const fulfilled = memory.alloc_root(),
    rejected = memory.alloc_root()
  context.status = CONTEXT_STATE.WAITING
  if (context.module) context.module.status = MODULE_STATE.AWAITING
  let registration
  try {
    resume_function(runtime, fulfilled, context, destination, false)
    resume_function(runtime, rejected, context, destination, true)
    registration = create_call_context(runtime, await_promise, undefined, [
      source,
      fulfilled,
      rejected,
    ])
    run_task(runtime, registration)
    if (registration.status === CONTEXT_STATE.FAILED)
      resume_context(runtime, context, destination, registration.error, true)
  } finally {
    if (registration) dispose_context(runtime, registration)
    memory.free_root(fulfilled)
    memory.free_root(rejected)
  }
}
