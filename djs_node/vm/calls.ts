import { panic } from "../utils.ts"
import type { JSValue } from "./storage/heap.ts"
import {
  VALUE_TAGS,
  heap_type_of,
  read_boolean,
  read_number,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
  write_uninitialized,
} from "./storage/value.ts"
import { HEAP_TYPES } from "./storage/layout.ts"
import { FUNCTION_DERIVED, register_index } from "../compiler/bytecode.ts"
import type { RegisterIndex } from "../compiler/bytecode.ts"
import type { BindingLocation, FunctionId } from "../compiler/compile.ts"
import type { Runtime } from "../runtime/runtime.ts"
import type { CodeId } from "../runtime/modules.ts"
import { write_string } from "./heap_types/string.ts"
import { has_property_list, set_prototype } from "./heap_types/object.ts"
import {
  BUILTIN_CONSTRUCTOR,
  function_code_id,
  function_flags,
  function_id as callee_function_id,
  load_builtin_steps,
  load_function_environment,
  load_function_new_target,
  load_function_receiver,
} from "./heap_types/function.ts"
import { create_environment } from "./heap_types/environment.ts"
import {
  create_value_array,
  load_value_array_element,
} from "./heap_types/value_array.ts"
import {
  create_arguments_object,
  create_array,
  create_function,
  create_object,
} from "./objects.ts"
import {
  define_property,
  get_own_property_descriptor,
  get_property_value,
} from "./properties.ts"
import { initialize_binding } from "./bindings.ts"
import {
  OK,
  THROW,
  throw_error,
  throw_value,
  take_exception,
} from "./errors.ts"
import type { Status } from "./errors.ts"
import { Frame } from "./frame.ts"
import {
  BUILTIN_CODE,
  NATIVE_CODE,
  RESUME_CODE,
  call_id,
  call_native_operation,
} from "./native_operations.ts"
import {
  create_suspended_frame,
  is_resumed,
  restore_frame,
  save_frame,
} from "./heap_types/suspended_frame.ts"
import { run_interpreter, unwind } from "./interpreter.ts"

/** Runs a module's top-level code to completion and writes its result. */
export function run_module_body(
  runtime: Runtime,
  destination: JSValue,
  code_id: CodeId,
  environment: JSValue,
): Status {
  const base = runtime.stack.fp
  if (
    push_frame(
      runtime,
      code_id,
      runtime.loader.code[code_id].unit.entry,
      environment,
      undefined,
      [],
      destination,
    ) === THROW
  )
    return THROW
  return run_interpreter(runtime, base)
}

/**
 * Starts a module's top-level code, which may await, and writes the %Promise%
 * it settles when it finishes. Returns once the code first awaits or finishes.
 */
export function start_module_body(
  runtime: Runtime,
  promise: JSValue,
  code_id: CodeId,
  environment: JSValue,
): Status {
  const capability = create_promise_capability(runtime, promise)
  if (capability === undefined) return THROW
  const base = runtime.stack.fp
  const status = push_frame(
    runtime,
    code_id,
    runtime.loader.code[code_id].unit.entry,
    environment,
    undefined,
    [],
    null,
  )
  if (status === OK)
    runtime.current_frame!.set_capability(capability.resolve, capability.reject)
  runtime.heap.handles.release(capability.resolve)
  runtime.heap.handles.release(capability.reject)
  if (status === THROW) return THROW
  return run_interpreter(runtime, base)
}

function push_frame(
  runtime: Runtime,
  code_id: CodeId,
  function_id: FunctionId,
  environment: JSValue,
  receiver: JSValue | undefined,
  arguments_: JSValue[],
  destination: JSValue | null,
  new_target?: JSValue,
): Status {
  const { heap } = runtime
  const fn = runtime.loader.code[code_id].unit.functions[function_id]
  if (!fn) panic("Invalid function descriptor")
  const frame = Frame.push(
    runtime,
    code_id,
    function_id,
    fn.slot_count,
    destination,
  )
  if (frame === undefined)
    return throw_error(
      runtime,
      "RangeError",
      "Maximum call stack size exceeded",
    )
  const env = frame.environment
  heap.copy_value(env, environment)
  if (receiver !== undefined) heap.copy_value(frame.this_value, receiver)
  if (new_target !== undefined) heap.copy_value(frame.new_target, new_target)
  const bind = (location: BindingLocation, value: JSValue) => {
    if ("register" in location)
      heap.copy_value(frame.register(register_index(location.register)), value)
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
      const array = heap.handles.local()
      const start = parameters.length
      const count = Math.max(0, arguments_.length - start)
      create_array(runtime, array, count)
      for (let index = 0; index < count; index++)
        define_property(runtime, array, String(index), {
          value: arguments_[start + index],
          writable: true,
          enumerable: true,
          configurable: true,
        })
      bind(rest, array)
    }
  })
  return OK
}

export function pop_frame(runtime: Runtime) {
  runtime.stack.pop()
}

/**
 * Starts a call to `callee`. Guest functions get a frame on top of the stack,
 * which the interpreter then runs; other callees finish here. On THROW, the
 * exception is to be thrown at the top frame, which is a resumed frame when
 * `callee` resumes one with a rejection.
 */
export function call_function(
  runtime: Runtime,
  destination: JSValue,
  callee: JSValue,
  receiver: JSValue | undefined,
  arguments_: JSValue[],
): Status {
  const { heap } = runtime
  if (
    callee === undefined ||
    heap_type_of(heap, callee) !== HEAP_TYPES.FUNCTION
  )
    return throw_error(runtime, "TypeError", "Value is not callable")
  const code_id = function_code_id(heap, callee),
    function_id = callee_function_id(heap, callee)
  if (code_id === RESUME_CODE)
    return resume_suspended_frame(runtime, destination, callee, arguments_[0])
  if (code_id === BUILTIN_CODE)
    return enter_builtin(runtime, destination, callee, receiver, arguments_)
  if (code_id === NATIVE_CODE && function_id === call_id())
    return heap.handles.scope(() => {
      const list = argument_list(runtime, arguments_[2])
      if (list === undefined) return THROW
      return call_function(
        runtime,
        destination,
        arguments_[0],
        arguments_[1],
        list,
      )
    })
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
  return enter_function(runtime, destination, callee, receiver, arguments_)
}

function enter_function(
  runtime: Runtime,
  destination: JSValue | null,
  callee: JSValue,
  receiver: JSValue | undefined,
  arguments_: JSValue[],
  target?: JSValue,
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
    return push_frame(
      runtime,
      code_id,
      function_id,
      environment,
      receiver,
      arguments_,
      destination,
      new_target,
    )
  })
}

// The elements of the array `list` given to `call`, read as own properties so
// that nothing a program changes on %Array.prototype% is involved.
function argument_list(runtime: Runtime, list: JSValue | undefined) {
  const { heap } = runtime
  if (list === undefined || tag_of(heap, list) === VALUE_TAGS.UNDEFINED)
    return []
  if (heap_type_of(heap, list) !== HEAP_TYPES.ARRAY) {
    throw_error(runtime, "TypeError", "call expects an array of arguments")
    return undefined
  }
  const length = read_number(
    heap,
    get_own_property_descriptor(runtime, list, "length")!.value!,
  )
  const result: JSValue[] = []
  for (let index = 0; index < length; index++) {
    const value = heap.handles.local()
    const element = get_own_property_descriptor(runtime, list, String(index))
    if (element?.value !== undefined) heap.copy_value(value, element.value)
    else write_undefined(heap, value)
    result.push(value)
  }
  return result
}

/**
 * Converts the object `source` with the stdlib's ToPrimitive, which can run
 * the object's own methods.
 * @see https://tc39.es/ecma262/#sec-toprimitive
 */
export function to_primitive(
  runtime: Runtime,
  destination: JSValue,
  source: JSValue,
  hint?: "string" | "number",
): Status {
  const operation = runtime.realm.abstract_operation("ToPrimitive")
  return runtime.heap.handles.scope(() => {
    const hint_value = runtime.heap.handles.local()
    if (hint !== undefined) write_string(runtime.heap, hint_value, hint)
    return call(runtime, destination, operation, undefined, [
      source,
      hint_value,
    ])
  })
}

/**
 * Runs `callee` to completion and writes its result. This is how VM operations
 * run guest code (getters, setters, coercions); the interpreter's CALL
 * continues the call in its own loop instead.
 */
export function call(
  runtime: Runtime,
  destination: JSValue,
  callee: JSValue,
  receiver: JSValue | undefined,
  args: JSValue[],
): Status {
  const base = runtime.stack.fp
  const status = call_function(runtime, destination, callee, receiver, args)
  if (status === THROW && unwind(runtime, base) === THROW) return THROW
  return run_interpreter(runtime, base)
}

/**
 * Creates a new %Promise%, written to `promise`, and returns its resolving
 * functions, which the caller releases.
 */
function create_promise_capability(runtime: Runtime, promise: JSValue) {
  const new_capability = runtime.realm.abstract_operation(
    "NewPromiseCapability",
  )
  const { heap } = runtime
  const resolve = heap.handles.persistent(),
    reject = heap.handles.persistent()
  const status = heap.handles.scope(() => {
    const record = heap.handles.local()
    if (call(runtime, record, new_capability, undefined, []) === THROW)
      return THROW
    for (const [name, target] of [
      ["promise", promise],
      ["resolve", resolve],
      ["reject", reject],
    ] as [string, JSValue][])
      if (get_property_value(runtime, target, record, name) === THROW)
        return THROW
    return OK
  })
  if (status === OK) return { resolve, reject }
  heap.handles.release(resolve)
  heap.handles.release(reject)
  return undefined
}

// The body runs in the caller's interpreter loop, so the promise is written
// before it starts. An exception before the frame exists rejects it.
function call_async_function(
  runtime: Runtime,
  destination: JSValue,
  callee: JSValue,
  receiver: JSValue | undefined,
  arguments_: JSValue[],
): Status {
  const capability = create_promise_capability(runtime, destination)
  if (capability === undefined) return THROW
  const { heap } = runtime
  let status = enter_function(runtime, null, callee, receiver, arguments_)
  if (status === OK)
    runtime.current_frame!.set_capability(capability.resolve, capability.reject)
  else
    status = heap.handles.scope(() => {
      const error = heap.handles.local(),
        ignored = heap.handles.local()
      take_exception(runtime, error)
      return call(runtime, ignored, capability.reject, undefined, [error])
    })
  heap.handles.release(capability.resolve)
  heap.handles.release(capability.reject)
  return status
}

// Puts the suspended frame a resume function carries back on top of the
// stack, with the awaited value in the AWAIT's destination register, or as an
// exception thrown there. Resume functions come in pairs and only the first
// call resumes.
function resume_suspended_frame(
  runtime: Runtime,
  destination: JSValue,
  callee: JSValue,
  argument: JSValue | undefined,
): Status {
  const { heap } = runtime
  write_undefined(heap, destination)
  return heap.handles.scope(() => {
    const captured = heap.handles.local(),
      suspended = heap.handles.local(),
      rejected = heap.handles.local(),
      register = heap.handles.local(),
      value = heap.handles.local()
    load_function_environment(heap, captured, callee)
    load_value_array_element(heap, suspended, captured, 0)
    load_value_array_element(heap, rejected, captured, 1)
    load_value_array_element(heap, register, captured, 2)
    if (is_resumed(heap, suspended)) return OK
    if (argument !== undefined) heap.copy_value(value, argument)
    const fp = restore_frame(heap, runtime.stack, suspended)
    if (fp === undefined)
      return throw_error(
        runtime,
        "RangeError",
        "Maximum call stack size exceeded",
      )
    if (read_boolean(heap, rejected)) return throw_value(runtime, value)
    const index = register_index(read_number(heap, register))
    heap.copy_value(new Frame(runtime, fp).register(index), value)
    return OK
  })
}

// [[Call]] and [[Construct]] of built-in function objects (ECMA-262 10.3.1,
// 10.3.2) both run the function's steps; construction passes new.target and
// no receiver, and the steps return the new object.
function enter_builtin(
  runtime: Runtime,
  destination: JSValue,
  callee: JSValue,
  receiver: JSValue | undefined,
  arguments_: JSValue[],
  new_target?: JSValue,
): Status {
  return runtime.heap.handles.scope(() => {
    const steps = runtime.heap.handles.local()
    if (!load_builtin_steps(runtime.heap, steps, callee))
      panic("Built-in function has no steps")
    return enter_function(
      runtime,
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
  destination: JSValue,
  callee: JSValue,
  arguments_: JSValue[],
  new_target: JSValue = callee,
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
      if (
        get_property_value(runtime, prototype, new_target, "prototype") ===
        THROW
      )
        return THROW
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
    const status = push_frame(
      runtime,
      code,
      id,
      environment,
      receiver,
      arguments_,
      destination,
      new_target,
    )
    if (status === OK) runtime.current_frame!.is_construct_call = true
    return status
  })
}

function create_resume_function(
  runtime: Runtime,
  destination: JSValue,
  suspended: JSValue,
  awaiting: RegisterIndex,
  rejected: boolean,
) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const flag = heap.handles.local(),
      register = heap.handles.local(),
      captured = heap.handles.local()
    write_boolean(heap, flag, rejected)
    write_number(heap, register, awaiting)
    create_value_array(heap, captured, [suspended, flag, register])
    create_function(runtime, destination, RESUME_CODE, 0, captured, 2)
  })
}

/**
 * Moves the top frame off the stack into a suspended frame until the promise
 * for `source` settles, at which point a resume function puts it back on top.
 * If registering the resume functions throws, the frame stays on top to handle
 * it.
 */
export function await_value(
  runtime: Runtime,
  destination: RegisterIndex,
  source: JSValue,
): Status {
  const frame = runtime.current_frame!
  if (!frame.capability)
    panic("Only async functions and program modules can await")
  const await_promise = runtime.realm.abstract_operation("Await")
  const { heap } = runtime
  return heap.handles.scope(() => {
    const suspended = heap.handles.local(),
      fulfilled = heap.handles.local(),
      rejected = heap.handles.local(),
      ignored = heap.handles.local()
    create_suspended_frame(heap, suspended, frame.register_count)
    create_resume_function(runtime, fulfilled, suspended, destination, false)
    create_resume_function(runtime, rejected, suspended, destination, true)
    if (
      call(runtime, ignored, await_promise, undefined, [
        source,
        fulfilled,
        rejected,
      ]) === THROW
    )
      return THROW
    save_frame(heap, runtime.stack, suspended, frame.fp)
    pop_frame(runtime)
    return OK
  })
}
