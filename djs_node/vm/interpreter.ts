import {
  context_create_storage,
  context_status,
  context_set_status,
  context_current_frame,
  context_commit_frame,
  context_pop_frame,
  context_result,
  context_error,
  context_increment_steps,
  context_set_await_rejection,
  context_take_await_rejection,
  context_reserve_frame,
  context_top_handler,
  context_push_handler,
  context_pop_handler,
  context_initialize_frame,
  context_frame_caller,
  context_frame_code_id,
  context_frame_function_id,
  context_frame_pc,
  context_frame_return_root,
  context_frame_environment_root,
  context_frame_this_root,
  context_frame_new_target_root,
  context_frame_register_count,
  context_frame_is_construct_call,
  context_set_frame_pc,
  context_advance_frame_pc,
  context_set_frame_construct_call,
  context_frame_register_root,
  context_set_frame_register_root,
  handler_frame,
  handler_catch_pc,
  handler_finally_pc,
  handler_end_pc,
  handler_exception_register,
  handler_phase,
  handler_completion_kind,
  handler_completion_value_root,
  handler_enter_catch,
  handler_save_completion,
  handler_environment_root,
  handler_start_pc,
  CONTEXT_STATE,
  HANDLER_PHASE,
  COMPLETION_KIND,
} from "./context.ts"
import {
  MODULE_STATE,
  module_state_set_status,
} from "../runtime/module-state.ts"
import type { Root, Memory } from "./memory.ts"
import type { Runtime, CodeId, LinkedCode } from "../runtime/modules.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type { BytecodeOffset, RegisterIndex } from "../compiler/bytecode.ts"
import type {
  Context,
  Frame,
  CompletionKind,
  HandlerOffset,
} from "./context.ts"
import type { HostError } from "../host/node.ts"
import {
  OP,
  INSTRUCTION_BYTES,
  decode_instruction,
  register_index,
  bytecode_offset,
  optional_bytecode_offset,
} from "../compiler/bytecode.ts"
import { alloc_root, free_root, copy_value } from "./memory.ts"
import {
  read_number,
  write_number,
  read_boolean,
  write_undefined,
  tag_of,
  write_string,
  write_boolean,
} from "./values.ts"
import { KINDS, TAGS } from "./memory.ts"
import {
  kind_of,
  create_object,
  create_arguments_object,
  create_function,
  function_code_id,
  function_id as callee_function_id,
  function_flags,
  BUILTIN_CONSTRUCTOR,
  load_builtin_steps,
  set_builtin_steps,
  load_function_environment,
  load_function_receiver,
  load_function_new_target,
  load_value_array_element,
  create_environment,
  copy_environment_bindings,
  environment_at,
  load_binding,
  initialize_binding,
  store_binding,
  get_property,
  set_property,
  private_property,
  set_prototype,
  truthy,
  binary_operation,
  unary_operation,
  to_string,
  create_array,
  define_property,
  delete_property,
  is_object,
  has_properties,
  has_property_list,
  has_property,
  create_string_object,
  for_in_keys,
} from "./objects.ts"
import {
  call_intrinsic,
  NATIVE_CODE,
  RESUME_CODE,
  BUILTIN_CODE,
  CALL_ID,
} from "./intrinsics.ts"
import {
  await_value,
  drain_completions,
  drain_jobs,
  pending_operations,
  wait_for_completion,
} from "../runtime/jobs.ts"

import { define_value_property } from "./properties.ts"
import { init_slot } from "./slots.ts"
import { panic } from "../utils.ts"
import {
  OK,
  THROW,
  throw_error,
  throw_value,
  take_exception,
  clear_exception,
} from "./completion.ts"
import type { Status } from "./completion.ts"
import {
  scheduler_has_jobs,
  scheduler_reset_task_steps,
  scheduler_increment_task_steps,
} from "../runtime/scheduler.ts"

export type { Context } from "./context.ts"

export function create_context(
  runtime: Runtime,
  code_id: CodeId,
  environment: Root,
): Context {
  const context = context_create_storage(
    runtime.contexts.length,
    alloc_root(runtime.memory),
    alloc_root(runtime.memory),
  )
  push_frame(
    runtime,
    context,
    code_id,
    runtime.code[code_id].unit.entry,
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
  const fn = runtime.code[code_id].unit.functions[function_id]
  if (!fn) panic("Invalid function descriptor")
  const offset = context_reserve_frame(context, fn.slot_count)
  const env = alloc_root(memory)
  const this_value = alloc_root(memory)
  copy_value(memory, env, environment)
  if (receiver !== undefined) copy_value(memory, this_value, receiver)
  const target = alloc_root(memory)
  if (new_target !== undefined) copy_value(memory, target, new_target)
  context_initialize_frame(context, offset, {
    caller: context_current_frame(context),
    code_id,
    function_id,
    return_root: destination,
    environment_root: env,
    this_root: this_value,
    new_target_root: target,
    register_count: fn.slot_count,
  })
  for (let index = 0; index < fn.slot_count; index++) {
    context_set_frame_register_root(
      context,
      offset,
      register_index(index),
      alloc_root(memory),
    )
  }
  if (fn.arguments_slot !== null) {
    const args = alloc_root(memory)
    try {
      create_arguments_object(memory, args, arguments_)
      initialize_binding(runtime, env, fn.arguments_slot, args)
    } finally {
      free_root(memory, args)
    }
  }
  for (let index = 0; index < fn.parameter_slots.length; index++) {
    const argument = arguments_[index]
    if (argument === undefined) {
      const empty = alloc_root(memory)
      try {
        initialize_binding(runtime, env, fn.parameter_slots[index], empty)
      } finally {
        free_root(memory, empty)
      }
    } else initialize_binding(runtime, env, fn.parameter_slots[index], argument)
  }
  if (fn.rest_slot !== null) {
    const rest = alloc_root(memory),
      key = alloc_root(memory)
    try {
      const start = fn.parameter_slots.length
      const count = Math.max(0, arguments_.length - start)
      create_array(memory, rest, count)
      for (let index = 0; index < count; index++) {
        write_string(memory, key, String(index))
        define_property(memory, rest, key, arguments_[start + index])
      }
      initialize_binding(runtime, env, fn.rest_slot, rest)
    } finally {
      free_root(memory, rest)
      free_root(memory, key)
    }
  }
  context_commit_frame(context, offset)
}

function pop_frame(runtime: Runtime, context: Context) {
  const frame = context_current_frame(context)!
  for (
    let index = 0;
    index < context_frame_register_count(context, frame);
    index++
  ) {
    free_root(
      runtime.memory,
      context_frame_register_root(context, frame, register_index(index)),
    )
  }
  free_root(runtime.memory, context_frame_environment_root(context, frame))
  free_root(runtime.memory, context_frame_this_root(context, frame))
  free_root(runtime.memory, context_frame_new_target_root(context, frame))
  context_pop_frame(context)
}

export function dispose_context(runtime: Runtime, context: Context) {
  if (context_status(context) === CONTEXT_STATE.DISPOSED) return
  while (context_top_handler(context) !== null) pop_handler(runtime, context)
  while (context_current_frame(context) !== null) pop_frame(runtime, context)
  free_root(runtime.memory, context_result(context))
  free_root(runtime.memory, context_error(context))
  context_set_status(context, CONTEXT_STATE.DISPOSED)
}

function call_function(
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
    const captured = alloc_root(memory),
      value = alloc_root(memory)
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
      free_root(memory, captured)
      free_root(memory, value)
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
  if (runtime.code[code_id].unit.functions[function_id].flags & 8)
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
  const parent = alloc_root(memory),
    environment = alloc_root(memory),
    this_value = alloc_root(memory),
    new_target = alloc_root(memory)
  try {
    load_function_environment(memory, parent, callee)
    const fn = runtime.code[code_id].unit.functions[function_id]
    const flags = function_flags(memory, callee)
    if (flags & 1)
      return throw_error(runtime, "TypeError", "Class constructor requires new")
    if (flags & 4) {
      load_function_receiver(memory, this_value, callee)
      receiver = this_value
      load_function_new_target(memory, new_target, callee)
    }
    if (target !== undefined) copy_value(memory, new_target, target)
    create_environment(
      memory,
      environment,
      parent,
      fn.binding_count,
      runtime.code[code_id].scope_ids[function_id],
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
    free_root(memory, new_target)
    free_root(memory, parent)
    free_root(memory, environment)
    free_root(memory, this_value)
  }
}

// A synchronous language operation may execute user code (valueOf/toString).
// Keep that execution in a rooted VM context and preserve thrown guest values.
function nullish(memory: Memory, value: Root) {
  return ([TAGS.NULL, TAGS.UNDEFINED] as number[]).includes(
    tag_of(memory, value),
  )
}

function check_properties(runtime: Runtime, value: Root): Status {
  if (!has_properties(runtime.memory, value))
    return throw_error(runtime, "TypeError", "Expected an object")
  return OK
}

// Reads a property, calling a getter synchronously.
function get_value(
  runtime: Runtime,
  destination: Root,
  object: Root,
  key: Root,
): Status {
  if (check_properties(runtime, object) === THROW) return THROW
  if (
    get_property(runtime.memory, destination, object, key) &&
    tag_of(runtime.memory, destination) !== TAGS.UNDEFINED
  )
    return invoke_sync(runtime, destination, destination, object, [])
  return OK
}

function close_iterator(runtime: Runtime, iterator: Root): Status {
  const { memory } = runtime
  const method = alloc_root(memory),
    result = alloc_root(memory)
  try {
    const key = runtime.property_names!.get("return")!
    if (get_value(runtime, method, iterator, key) === THROW) return THROW
    if (nullish(memory, method)) return OK
    if (invoke_sync(runtime, result, method, iterator, []) === THROW)
      return THROW
    if (!is_object(memory, result))
      return throw_error(
        runtime,
        "TypeError",
        "Iterator result is not an object",
      )
    return OK
  } finally {
    free_root(memory, method)
    free_root(memory, result)
  }
}

export function coerce_value(
  runtime: Runtime,
  destination: Root,
  source: Root,
  operation: string,
  hint?: string,
): Status {
  const helper = runtime.intrinsics.get(operation)
  if (helper === undefined) {
    copy_value(runtime.memory, destination, source)
    return OK
  }
  const hint_value = alloc_root(runtime.memory)
  try {
    if (hint !== undefined) write_string(runtime.memory, hint_value, hint)
    return invoke_sync(runtime, destination, helper, undefined, [
      source,
      hint_value,
    ])
  } finally {
    free_root(runtime.memory, hint_value)
  }
}

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
    if (context_status(context) === CONTEXT_STATE.FAILED)
      return throw_value(runtime, context_error(context))
    if (context_status(context) !== CONTEXT_STATE.DONE)
      panic("Internal operations must complete synchronously")
    copy_value(runtime.memory, destination, context_result(context))
    return OK
  } finally {
    dispose_context(runtime, context)
  }
}

function load_property_key(
  runtime: Runtime,
  destination: Root,
  source: Root,
): Status {
  copy_value(runtime.memory, destination, source)
  if (is_object(runtime.memory, destination))
    return coerce_value(runtime, destination, destination, "ToString")
  return OK
}

function create_block_environment(
  memory: Memory,
  destination: Root,
  parent: Root,
  code: LinkedCode,
  function_id: FunctionId,
  block: number,
) {
  create_environment(
    memory,
    destination,
    parent,
    code.unit.functions[function_id].block_binding_flags[block].length,
    code.block_scope_ids[function_id][block],
  )
}

const op = {
  LOAD_CONST(memory: Memory, destination: Root, constant: Root) {
    copy_value(memory, destination, constant)
  },
  MOVE(memory: Memory, destination: Root, source: Root) {
    copy_value(memory, destination, source)
  },
  LOAD_BINDING(
    runtime: Runtime,
    destination: Root,
    env: Root,
    depth: number,
    slot: number,
    temporary: Root,
  ): Status {
    environment_at(runtime.memory, temporary, env, depth)
    return load_binding(runtime, destination, temporary, slot)
  },
  INIT_BINDING(
    runtime: Runtime,
    env: Root,
    depth: number,
    slot: number,
    value: Root,
    temporary: Root,
  ) {
    environment_at(runtime.memory, temporary, env, depth)
    initialize_binding(runtime, temporary, slot, value)
  },
  STORE_BINDING(
    runtime: Runtime,
    env: Root,
    depth: number,
    slot: number,
    value: Root,
    temporary: Root,
  ): Status {
    environment_at(runtime.memory, temporary, env, depth)
    return store_binding(runtime, temporary, slot, value)
  },
  LOAD_GLOBAL(
    runtime: Runtime,
    destination: Root,
    name: string,
    allow_unresolved: boolean,
  ): Status {
    const global = runtime.globals.get(name)
    if (global === undefined) {
      if (allow_unresolved)
        write_undefined(runtime.memory, destination) // typeof unresolvable name
      else
        return throw_error(runtime, "ReferenceError", `${name} is not defined`)
    } else copy_value(runtime.memory, destination, global)
    return OK
  },
  // Iteration ops call guest methods synchronously, like coercions.
  GET_ITERATOR(
    runtime: Runtime,
    iterator: Root,
    next: Root,
    iterable: Root,
    temporary: Root,
  ): Status {
    const { memory } = runtime
    if (nullish(memory, iterable))
      return throw_error(runtime, "TypeError", "Value is not iterable")
    if (
      get_value(
        runtime,
        temporary,
        iterable,
        runtime.well_known_symbols!.get("iterator")!,
      ) === THROW
    )
      return THROW
    if (nullish(memory, temporary))
      return throw_error(runtime, "TypeError", "Value is not iterable")
    if (invoke_sync(runtime, iterator, temporary, iterable, []) === THROW)
      return THROW
    if (!is_object(memory, iterator))
      return throw_error(
        runtime,
        "TypeError",
        "Result of Symbol.iterator is not an object",
      )
    return get_value(
      runtime,
      next,
      iterator,
      runtime.property_names!.get("next")!,
    )
  },
  ITERATOR_NEXT(
    runtime: Runtime,
    context: Context,
    frame: Frame,
    destination: Root,
    iterator: Root,
    next: Root,
    done_target: number,
    temporary: Root,
    operand: Root,
  ): Status {
    const { memory } = runtime
    if (invoke_sync(runtime, temporary, next, iterator, []) === THROW)
      return THROW
    if (!is_object(memory, temporary))
      return throw_error(
        runtime,
        "TypeError",
        "Iterator result is not an object",
      )
    const done = runtime.property_names!.get("done")!
    if (get_value(runtime, operand, temporary, done) === THROW) return THROW
    if (truthy(memory, operand)) {
      context_set_frame_pc(context, frame, bytecode_offset(done_target))
      return OK
    }
    return get_value(
      runtime,
      destination,
      temporary,
      runtime.property_names!.get("value")!,
    )
  },
  ITERATOR_CLOSE(runtime: Runtime, iterator: Root, throwing: boolean): Status {
    const status = close_iterator(runtime, iterator)
    if (!throwing) return status
    // The pending throw wins over errors from closing.
    if (status === THROW) clear_exception(runtime)
    return OK
  },
  FOR_IN_START(
    runtime: Runtime,
    keys: Root,
    object: Root,
    index: Root,
    source: Root,
  ): Status {
    const { memory } = runtime
    write_number(memory, index, 0)
    if (kind_of(memory, source) === KINDS.STRING)
      create_string_object(memory, object, source)
    else copy_value(memory, object, source)
    if (!is_object(memory, object)) create_array(memory, keys, 0)
    else if (has_property_list(memory, object))
      for_in_keys(memory, keys, object)
    else return throw_error(runtime, "TypeError", "Expected an object")
    return OK
  },
  // Keys deleted after the snapshot are skipped.
  FOR_IN_NEXT(
    runtime: Runtime,
    context: Context,
    frame: Frame,
    destination: Root,
    keys: Root,
    object: Root,
    index_root: Root,
    end_target: number,
    temporary: Root,
    operand: Root,
  ) {
    const { memory } = runtime
    let index = read_number(memory, index_root)
    get_property(
      memory,
      temporary,
      keys,
      runtime.property_names!.get("length")!,
    )
    const length = read_number(memory, temporary)
    let found = false
    while (!found && index < length) {
      write_number(memory, operand, index)
      index++
      get_property(memory, temporary, keys, operand)
      if (has_property(memory, object, temporary)) {
        copy_value(memory, destination, temporary)
        found = true
      }
    }
    write_number(memory, index_root, index)
    if (!found)
      context_set_frame_pc(context, frame, bytecode_offset(end_target))
  },
  LOAD_NEW_TARGET(
    memory: Memory,
    destination: Root,
    context: Context,
    frame: Frame,
  ) {
    copy_value(
      memory,
      destination,
      context_frame_new_target_root(context, frame),
    )
  },
  TO_PROPERTY_KEY(
    runtime: Runtime,
    destination: Root,
    source: Root,
    property_key: Root,
  ): Status {
    if (load_property_key(runtime, property_key, source) === THROW) return THROW
    if (kind_of(runtime.memory, property_key) === KINDS.SYMBOL)
      copy_value(runtime.memory, destination, property_key)
    else
      write_string(
        runtime.memory,
        destination,
        to_string(runtime.memory, property_key),
      )
    return OK
  },
  CREATE_ARRAY(memory: Memory, destination: Root, length: number) {
    create_array(memory, destination, length)
  },
  DELETE_PROP(
    runtime: Runtime,
    destination: Root,
    object: Root,
    key: Root,
    property_key: Root,
  ): Status {
    if (load_property_key(runtime, property_key, key) === THROW) return THROW
    if (check_properties(runtime, object) === THROW) return THROW
    if (!delete_property(runtime.memory, object, property_key))
      return throw_error(
        runtime,
        "TypeError",
        "Cannot delete non-configurable property",
      )
    write_boolean(runtime.memory, destination, true)
    return OK
  },
  GET_PROP(
    runtime: Runtime,
    context: Context,
    destination: Root,
    object: Root,
    key: Root,
    property_key: Root,
  ): Status {
    const { memory } = runtime
    if (load_property_key(runtime, property_key, key) === THROW) return THROW
    if (check_properties(runtime, object) === THROW) return THROW
    if (
      get_property(memory, destination, object, property_key) &&
      tag_of(memory, destination) !== TAGS.UNDEFINED
    )
      return call_function(
        runtime,
        context,
        destination,
        destination,
        object,
        [],
      )
    return OK
  },
  SET_PROP(
    runtime: Runtime,
    context: Context,
    object: Root,
    key: Root,
    value: Root,
    property_key: Root,
    operand: Root,
    temporary: Root,
  ): Status {
    const { memory } = runtime
    if (load_property_key(runtime, property_key, key) === THROW) return THROW
    if (check_properties(runtime, object) === THROW) return THROW
    copy_value(memory, operand, value)
    if (
      set_property(
        runtime,
        temporary,
        object,
        property_key,
        operand,
        define_value_property,
      ) === THROW
    )
      return THROW
    if (tag_of(memory, temporary) === TAGS.UNDEFINED) return OK
    return call_function(
      runtime,
      context,
      context_result(context),
      temporary,
      object,
      [value],
    )
  },
  DEFINE_PROP(
    runtime: Runtime,
    object: Root,
    key: Root,
    value: Root,
    flags: number,
    setter: Root | undefined,
    property_key: Root,
    operand: Root,
  ): Status {
    if (load_property_key(runtime, property_key, key) === THROW) return THROW
    copy_value(runtime.memory, operand, value)
    return define_value_property(
      runtime,
      object,
      property_key,
      operand,
      flags,
      setter,
    )
  },
  SET_PROTO(memory: Memory, object: Root, prototype: Root) {
    set_prototype(memory, object, prototype)
  },
  SET_PRIVATE(
    runtime: Runtime,
    object: Root,
    key: Root,
    value: Root,
    initialize: boolean,
    readonly: boolean,
    temporary: Root,
  ): Status {
    return private_property(
      runtime,
      temporary,
      object,
      key,
      value,
      initialize,
      false,
      readonly,
    )
  },
  GET_PRIVATE(
    runtime: Runtime,
    destination: Root,
    object: Root,
    key: Root,
    has: boolean,
  ): Status {
    return private_property(
      runtime,
      destination,
      object,
      key,
      undefined,
      false,
      has,
    )
  },
  INIT_SLOT(runtime: Runtime, object: Root, name: string, value: Root): Status {
    return init_slot(runtime, object, name, value)
  },
  SET_BEHAVIOR(
    memory: Memory,
    object: Root,
    steps: Root,
    constructor: boolean,
  ) {
    set_builtin_steps(memory, object, steps, constructor)
  },
  CREATE_OBJECT(memory: Memory, destination: Root) {
    create_object(memory, destination)
  },
  CREATE_CLOSURE(
    memory: Memory,
    context: Context,
    frame: Frame,
    destination: Root,
    code: LinkedCode,
    code_id: CodeId,
    function_id: number,
    env: Root,
  ) {
    const fn = code.unit.functions[function_id]
    const lexical = fn.flags & 4
    create_function(
      memory,
      destination,
      code_id,
      function_id,
      env,
      fn.flags,
      lexical ? context_frame_this_root(context, frame) : undefined,
      lexical ? context_frame_new_target_root(context, frame) : undefined,
      fn,
    )
  },
  CALL(
    runtime: Runtime,
    context: Context,
    destination: Root,
    callee: Root,
    receiver: Root,
    arguments_: Root[],
  ): Status {
    return call_function(
      runtime,
      context,
      destination,
      callee,
      receiver,
      arguments_,
    )
  },
  CONSTRUCT(
    runtime: Runtime,
    context: Context,
    destination: Root,
    callee: Root,
    arguments_: Root[],
  ): Status {
    return construct_function(runtime, context, destination, callee, arguments_)
  },
  PUSH_ENV(
    memory: Memory,
    env: Root,
    code: LinkedCode,
    function_id: FunctionId,
    block: number,
    temporary: Root,
  ) {
    create_block_environment(memory, temporary, env, code, function_id, block)
    copy_value(memory, env, temporary)
  },
  // Replaces the current environment with a sibling holding the same values,
  // giving each loop iteration fresh bindings.
  COPY_ENV(
    memory: Memory,
    env: Root,
    code: LinkedCode,
    function_id: FunctionId,
    block: number,
    temporary: Root,
    operand: Root,
  ) {
    environment_at(memory, operand, env, 1)
    create_block_environment(
      memory,
      temporary,
      operand,
      code,
      function_id,
      block,
    )
    copy_environment_bindings(memory, temporary, env)
    copy_value(memory, env, temporary)
  },
  POP_ENV(memory: Memory, env: Root, depth: number, temporary: Root) {
    environment_at(memory, temporary, env, depth)
    copy_value(memory, env, temporary)
  },
  JUMP_OUT(
    runtime: Runtime,
    context: Context,
    target: number,
    temporary: Root,
  ) {
    write_number(runtime.memory, temporary, target)
    complete(runtime, context, COMPLETION_KIND.JUMP, temporary)
  },
  TRY(
    runtime: Runtime,
    context: Context,
    frame: Frame,
    start_pc: number,
    catch_pc: number,
    finally_pc: number,
    end_pc: number,
    exception_register: number,
  ) {
    push_handler(
      runtime,
      context,
      frame,
      bytecode_offset(start_pc),
      optional_bytecode_offset(catch_pc),
      optional_bytecode_offset(finally_pc),
      bytecode_offset(end_pc),
      register_index(exception_register),
    )
  },
  LEAVE_TRY(runtime: Runtime, context: Context) {
    leave_handler(runtime, context)
  },
  // The handlers below return true when run_interpreter must stop.
  END_FINALLY(
    runtime: Runtime,
    context: Context,
    frame: Frame,
    temporary: Root,
  ): boolean {
    const handler = context_top_handler(context)!
    const type = handler_completion_kind(context.handlers, handler),
      value = handler_completion_value_root(context.handlers, handler),
      end = handler_end_pc(context.handlers, handler)
    copy_value(runtime.memory, temporary, value)
    pop_handler(runtime, context)
    if (type === COMPLETION_KIND.NORMAL)
      context_set_frame_pc(context, frame, end)
    else complete(runtime, context, type, temporary)
    return ([CONTEXT_STATE.DONE, CONTEXT_STATE.FAILED] as number[]).includes(
      context_status(context),
    )
  },
  RETURN(runtime: Runtime, context: Context, value: Root): boolean {
    complete(runtime, context, COMPLETION_KIND.RETURN, value)
    return context_status(context) === CONTEXT_STATE.DONE
  },
  AWAIT(runtime: Runtime, context: Context, destination: Root, value: Root) {
    await_value(runtime, context, destination, value)
    return true
  },
  THROW(runtime: Runtime, context: Context, value: Root): boolean {
    complete(runtime, context, COMPLETION_KIND.THROW, value)
    return context_status(context) === CONTEXT_STATE.FAILED
  },
  JUMP(context: Context, frame: Frame, target: number) {
    context_set_frame_pc(context, frame, bytecode_offset(target))
  },
  JUMP_IF_FALSY(
    memory: Memory,
    context: Context,
    frame: Frame,
    condition: Root,
    target: number,
  ) {
    if (!truthy(memory, condition))
      context_set_frame_pc(context, frame, bytecode_offset(target))
  },
  BINARY_OP(
    runtime: Runtime,
    destination: Root,
    left: Root,
    right: Root,
    operator: string,
    temporary: Root,
    operand: Root,
  ): Status {
    const { memory } = runtime
    copy_value(memory, temporary, left)
    copy_value(memory, operand, right)
    if (operator === "in") {
      if (!is_object(memory, operand))
        return throw_error(
          runtime,
          "TypeError",
          "Right operand of in must be an object",
        )
      if (
        is_object(memory, temporary) &&
        coerce_value(runtime, temporary, temporary, "ToString") === THROW
      )
        return THROW
    } else if (!["===", "!==", "instanceof"].includes(operator)) {
      const loose = operator === "==" || operator === "!="
      const left_object = is_object(memory, temporary),
        right_object = is_object(memory, operand)
      const either_nullish =
        nullish(memory, temporary) || nullish(memory, operand)
      if (!loose || (left_object !== right_object && !either_nullish)) {
        const hint = operator === "+" || loose ? undefined : "number"
        if (
          left_object &&
          coerce_value(runtime, temporary, temporary, "ToPrimitive", hint) ===
            THROW
        )
          return THROW
        if (
          right_object &&
          coerce_value(runtime, operand, operand, "ToPrimitive", hint) === THROW
        )
          return THROW
      }
    }
    return binary_operation(runtime, destination, temporary, operand, operator)
  },
  UNARY_OP(
    runtime: Runtime,
    destination: Root,
    source: Root,
    operator: string,
    operand: Root,
  ): Status {
    copy_value(runtime.memory, operand, source)
    if (
      ["+", "-", "~"].includes(operator) &&
      is_object(runtime.memory, operand) &&
      coerce_value(runtime, operand, operand, "ToNumber") === THROW
    )
      return THROW
    return unary_operation(runtime, destination, operand, operator)
  },
  LOAD_THIS(memory: Memory, destination: Root, context: Context, frame: Frame) {
    copy_value(memory, destination, context_frame_this_root(context, frame))
  },
}

export function run_interpreter(runtime: Runtime, context: Context) {
  const { memory } = runtime
  context_set_status(context, CONTEXT_STATE.RUNNING)
  if (context.module_state)
    module_state_set_status(context.module_state, MODULE_STATE.EVALUATING)
  const temporary = alloc_root(memory),
    operand = alloc_root(memory),
    property_key = alloc_root(memory)
  try {
    if (context_take_await_rejection(context)) {
      complete(runtime, context, COMPLETION_KIND.THROW, context_error(context))
      if (context_status(context) === CONTEXT_STATE.FAILED) return
    }
    // run_task preserves run-to-completion across these bounded slices.
    for (let slice = 0; slice < 10000; slice++) {
      const steps = context_increment_steps(context)
      const task_steps = scheduler_increment_task_steps(runtime.scheduler)
      if (steps > runtime.max_steps || task_steps > runtime.max_steps)
        panic("VM instruction limit exceeded")
      const frame = context_current_frame(context)
      if (frame === null) panic("No active frame")
      const code_id = context_frame_code_id(context, frame)
      const function_id = context_frame_function_id(context, frame)
      const code = runtime.code[code_id]
      const pc = context_frame_pc(context, frame)
      const { opcode, a, b, c, d, e } = decode_instruction(
        code.bytecodes[function_id],
        pc,
      )
      context_advance_frame_pc(context, frame, INSTRUCTION_BYTES)
      const reg = (index: number) =>
        context_frame_register_root(context, frame, register_index(index))
      const env = context_frame_environment_root(context, frame)
      let status: Status = OK
      switch (opcode) {
        case OP.LOAD_CONST:
          op.LOAD_CONST(memory, reg(a), code.constants[b])
          break
        case OP.MOVE:
          op.MOVE(memory, reg(a), reg(b))
          break
        case OP.LOAD_BINDING:
          status = op.LOAD_BINDING(runtime, reg(a), env, b, c, temporary)
          break
        case OP.INIT_BINDING:
          op.INIT_BINDING(runtime, env, a, b, reg(c), temporary)
          break
        case OP.STORE_BINDING:
          status = op.STORE_BINDING(runtime, env, a, b, reg(c), temporary)
          break
        case OP.LOAD_GLOBAL:
          status = op.LOAD_GLOBAL(
            runtime,
            reg(a),
            code.unit.literals[b] as string,
            c === 1,
          )
          break
        case OP.GET_ITERATOR:
          status = op.GET_ITERATOR(runtime, reg(a), reg(b), reg(c), temporary)
          break
        case OP.ITERATOR_NEXT:
          status = op.ITERATOR_NEXT(
            runtime,
            context,
            frame,
            reg(a),
            reg(b),
            reg(c),
            d,
            temporary,
            operand,
          )
          break
        case OP.ITERATOR_CLOSE:
          status = op.ITERATOR_CLOSE(runtime, reg(a), b !== 0)
          break
        case OP.FOR_IN_START:
          status = op.FOR_IN_START(runtime, reg(a), reg(b), reg(c), reg(d))
          break
        case OP.INIT_SLOT:
          status = op.INIT_SLOT(
            runtime,
            reg(a),
            code.unit.literals[b] as string,
            reg(c),
          )
          break
        case OP.SET_BEHAVIOR:
          op.SET_BEHAVIOR(memory, reg(a), reg(b), c === 1)
          break
        case OP.FOR_IN_NEXT:
          op.FOR_IN_NEXT(
            runtime,
            context,
            frame,
            reg(a),
            reg(b),
            reg(c),
            reg(d),
            e,
            temporary,
            operand,
          )
          break
        case OP.LOAD_NEW_TARGET:
          op.LOAD_NEW_TARGET(memory, reg(a), context, frame)
          break
        case OP.TO_PROPERTY_KEY:
          status = op.TO_PROPERTY_KEY(runtime, reg(a), reg(b), property_key)
          break
        case OP.CREATE_ARRAY:
          op.CREATE_ARRAY(memory, reg(a), b)
          break
        case OP.DELETE_PROP:
          status = op.DELETE_PROP(runtime, reg(a), reg(b), reg(c), property_key)
          break
        case OP.GET_PROP:
          status = op.GET_PROP(
            runtime,
            context,
            reg(a),
            reg(b),
            reg(c),
            property_key,
          )
          break
        case OP.SET_PROP:
          status = op.SET_PROP(
            runtime,
            context,
            reg(a),
            reg(b),
            reg(c),
            property_key,
            operand,
            temporary,
          )
          break
        case OP.DEFINE_PROP:
          status = op.DEFINE_PROP(
            runtime,
            reg(a),
            reg(b),
            reg(c),
            d,
            e === 1 ? reg(c) : undefined,
            property_key,
            operand,
          )
          break
        case OP.SET_PROTO:
          op.SET_PROTO(memory, reg(a), reg(b))
          break
        case OP.INIT_PRIVATE:
        case OP.SET_PRIVATE:
          status = op.SET_PRIVATE(
            runtime,
            reg(a),
            reg(b),
            reg(c),
            opcode === OP.INIT_PRIVATE,
            d === 1,
            temporary,
          )
          break
        case OP.GET_PRIVATE:
        case OP.HAS_PRIVATE:
          status = op.GET_PRIVATE(
            runtime,
            reg(a),
            reg(b),
            reg(c),
            opcode === OP.HAS_PRIVATE,
          )
          break
        case OP.CREATE_OBJECT:
          op.CREATE_OBJECT(memory, reg(a))
          break
        case OP.CREATE_CLOSURE:
          op.CREATE_CLOSURE(
            memory,
            context,
            frame,
            reg(a),
            code,
            code_id,
            b,
            env,
          )
          break
        case OP.CALL:
          status = op.CALL(
            runtime,
            context,
            reg(a),
            reg(b),
            reg(c),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.CONSTRUCT:
          status = op.CONSTRUCT(
            runtime,
            context,
            reg(a),
            reg(b),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.PUSH_ENV:
          op.PUSH_ENV(memory, env, code, function_id, a, temporary)
          break
        case OP.COPY_ENV:
          op.COPY_ENV(memory, env, code, function_id, a, temporary, operand)
          break
        case OP.POP_ENV:
          op.POP_ENV(memory, env, a, temporary)
          break
        case OP.JUMP_OUT:
          op.JUMP_OUT(runtime, context, a, temporary)
          break
        case OP.TRY:
          op.TRY(runtime, context, frame, pc, a, b, c, d)
          break
        case OP.LEAVE_TRY:
          op.LEAVE_TRY(runtime, context)
          break
        case OP.END_FINALLY:
          if (op.END_FINALLY(runtime, context, frame, temporary)) return
          break
        case OP.RETURN:
          if (op.RETURN(runtime, context, reg(a))) return
          break
        case OP.AWAIT:
          if (op.AWAIT(runtime, context, reg(a), reg(b))) return
          break
        case OP.THROW:
          if (op.THROW(runtime, context, reg(a))) return
          break
        case OP.JUMP:
          op.JUMP(context, frame, a)
          break
        case OP.JUMP_IF_FALSY:
          op.JUMP_IF_FALSY(memory, context, frame, reg(a), b)
          break
        case OP.BINARY_OP:
          status = op.BINARY_OP(
            runtime,
            reg(a),
            reg(b),
            reg(c),
            code.unit.literals[d] as string,
            temporary,
            operand,
          )
          break
        case OP.UNARY_OP:
          status = op.UNARY_OP(
            runtime,
            reg(a),
            reg(b),
            code.unit.literals[c] as string,
            operand,
          )
          break
        case OP.LOAD_THIS:
          op.LOAD_THIS(memory, reg(a), context, frame)
          break
        default:
          panic(`Unknown opcode: ${opcode}`)
      }
      if (status === THROW) {
        complete(
          runtime,
          context,
          COMPLETION_KIND.THROW,
          runtime.pending_exception,
        )
        clear_exception(runtime)
        if (context_status(context) === CONTEXT_STATE.FAILED) return
      }
      // The helper root must not retain environments after the instruction.
      write_undefined(memory, temporary)
      write_undefined(memory, operand)
      write_undefined(memory, property_key)
    }
    context_set_status(context, CONTEXT_STATE.READY)
  } finally {
    free_root(memory, temporary)
    free_root(memory, operand)
    free_root(memory, property_key)
  }
}

export function run_task(runtime: Runtime, context: Context) {
  while (
    context_status(context) === CONTEXT_STATE.READY ||
    context_status(context) === CONTEXT_STATE.RUNNING
  )
    run_interpreter(runtime, context)
  if (
    context.settle &&
    (context_status(context) === CONTEXT_STATE.DONE ||
      context_status(context) === CONTEXT_STATE.FAILED)
  )
    settle_async_function(runtime, context)
}

// Each async call runs in its own context, so AWAIT suspends only that call.
function call_async_function(
  runtime: Runtime,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
): Status {
  const new_capability = runtime.intrinsics.get("NewPromiseCapability")
  if (new_capability === undefined) panic("Promise is not initialized")
  const { memory } = runtime
  const key = alloc_root(memory),
    resolve = alloc_root(memory),
    reject = alloc_root(memory)
  const capability = create_call_context(runtime, new_capability, undefined, [])
  try {
    run_task(runtime, capability)
    if (context_status(capability) === CONTEXT_STATE.FAILED) {
      free_root(memory, resolve)
      free_root(memory, reject)
      return throw_value(runtime, context_error(capability))
    }
    for (const [name, target] of [
      ["promise", destination],
      ["resolve", resolve],
      ["reject", reject],
    ] as [string, Root][]) {
      write_string(memory, key, name)
      get_property(memory, target, context_result(capability), key)
    }
  } finally {
    dispose_context(runtime, capability)
    free_root(memory, key)
  }
  const context = create_empty_context(runtime)
  context.settle = { resolve, reject }
  if (
    enter_function(
      runtime,
      context,
      context_result(context),
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, context_error(context))
    context_set_status(context, CONTEXT_STATE.FAILED)
  }
  run_task(runtime, context)
  return OK
}

function settle_async_function(runtime: Runtime, context: Context) {
  const { resolve, reject } = context.settle!
  context.settle = undefined
  const fulfilled = context_status(context) === CONTEXT_STATE.DONE
  let settlement
  try {
    settlement = create_call_context(
      runtime,
      fulfilled ? resolve : reject,
      undefined,
      [fulfilled ? context_result(context) : context_error(context)],
    )
    run_task(runtime, settlement)
  } finally {
    if (settlement) dispose_context(runtime, settlement)
    dispose_context(runtime, context)
    free_root(runtime.memory, resolve)
    free_root(runtime.memory, reject)
  }
}

export async function evaluate_context(runtime: Runtime, context: Context) {
  // Include all callbacks and await helpers in this module evaluation's budget.
  scheduler_reset_task_steps(runtime.scheduler)
  run_task(runtime, context)
  while (true) {
    drain_completions(runtime)
    drain_jobs(runtime)
    if (context_status(context) === CONTEXT_STATE.READY)
      run_task(runtime, context)
    if (context_status(context) === CONTEXT_STATE.FAILED)
      throw new Error(to_string(runtime.memory, context_error(context)))
    if (
      scheduler_has_jobs(runtime.scheduler) ||
      runtime.scheduler.completions.length !== 0
    )
      continue
    if (pending_operations(runtime) !== 0) {
      await wait_for_completion(runtime)
      continue
    }
    if (context_status(context) === CONTEXT_STATE.DONE) return
    const error: HostError = new Error("Top-level await did not settle")
    error.exit_code = 13
    throw error
  }
}

function create_empty_context(runtime: Runtime): Context {
  const context = context_create_storage(
    runtime.contexts.length,
    alloc_root(runtime.memory),
    alloc_root(runtime.memory),
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
      context_result(context),
      callee,
      receiver,
      arguments_,
    ) === THROW
  ) {
    take_exception(runtime, context_error(context))
    context_set_status(context, CONTEXT_STATE.FAILED)
  } else if (context_current_frame(context) === null)
    context_set_status(context, CONTEXT_STATE.DONE)
  return context
}

export function resume_context(
  runtime: Runtime,
  context: Context,
  destination: Root,
  argument: Root | undefined,
  rejected: boolean,
) {
  if (context_status(context) !== CONTEXT_STATE.WAITING) return
  if (argument !== undefined)
    copy_value(
      runtime.memory,
      rejected ? context_error(context) : destination,
      argument,
    )
  else
    write_undefined(
      runtime.memory,
      rejected ? context_error(context) : destination,
    )
  context_set_await_rejection(context, rejected)
  context_set_status(context, CONTEXT_STATE.READY)
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
  const steps = alloc_root(runtime.memory)
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
    free_root(runtime.memory, steps)
  }
}

function construct_function(
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
    runtime.code[code].unit.functions[id].flags & 14
  )
    return throw_error(runtime, "TypeError", "Value is not a constructor")
  const receiver = alloc_root(memory),
    key = alloc_root(memory),
    prototype = alloc_root(memory),
    parent = alloc_root(memory),
    environment = alloc_root(memory)
  try {
    load_function_environment(memory, parent, callee)
    const { unit, scope_ids } = runtime.code[code],
      fn = unit.functions[id]
    create_object(memory, receiver)
    // Constructors in the supported subset have data-valued prototype properties.
    write_string(memory, key, "prototype")
    get_property(memory, prototype, callee, key)
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
    context_set_frame_construct_call(context, context_current_frame(context)!)
    return OK
  } finally {
    for (const root of [receiver, key, prototype, parent, environment])
      free_root(memory, root)
  }
}

function push_handler(
  runtime: Runtime,
  context: Context,
  frame: Frame,
  start_pc: BytecodeOffset,
  catch_pc: BytecodeOffset | null,
  finally_pc: BytecodeOffset | null,
  end_pc: BytecodeOffset,
  exception_register: RegisterIndex,
) {
  const completion_value_root = alloc_root(runtime.memory)
  const environment_root = alloc_root(runtime.memory)
  copy_value(
    runtime.memory,
    environment_root,
    context_frame_environment_root(context, frame),
  )
  context_push_handler(context, {
    frame,
    start_pc,
    catch_pc,
    finally_pc,
    end_pc,
    exception_register,
    completion_value_root,
    environment_root,
  })
}

function pop_handler(runtime: Runtime, context: Context) {
  const handler = context_top_handler(context)!
  free_root(
    runtime.memory,
    handler_completion_value_root(context.handlers, handler),
  )
  free_root(runtime.memory, handler_environment_root(context.handlers, handler))
  context_pop_handler(context)
}

// Catch and finally blocks run in the environment of their try statement.
function restore_handler_environment(
  runtime: Runtime,
  context: Context,
  frame: Frame,
  handler: HandlerOffset,
) {
  copy_value(
    runtime.memory,
    context_frame_environment_root(context, frame),
    handler_environment_root(context.handlers, handler),
  )
}

function leave_handler(runtime: Runtime, context: Context) {
  const handler = context_top_handler(context)!
  const frame = handler_frame(context.handlers, handler)
  const finally_pc = handler_finally_pc(context.handlers, handler)
  if (finally_pc !== null) {
    handler_save_completion(context.handlers, handler, COMPLETION_KIND.NORMAL)
    context_set_frame_pc(context, frame, finally_pc)
  } else {
    const end = handler_end_pc(context.handlers, handler)
    pop_handler(runtime, context)
    context_set_frame_pc(context, frame, end)
  }
}

// Finally preserves the original completion value in a root until it resumes,
// or a new abrupt completion replaces it.
function complete(
  runtime: Runtime,
  context: Context,
  type: CompletionKind,
  source: Root,
) {
  const { memory } = runtime
  const value = alloc_root(memory)
  copy_value(memory, value, source)
  try {
    while (true) {
      const frame = context_current_frame(context)
      const handler = context_top_handler(context)
      if (
        frame !== null &&
        handler !== null &&
        handler_frame(context.handlers, handler) === frame
      ) {
        if (type === COMPLETION_KIND.JUMP) {
          const target = read_number(memory, value)
          if (
            target >= handler_start_pc(context.handlers, handler) &&
            target < handler_end_pc(context.handlers, handler)
          ) {
            context_set_frame_pc(context, frame, bytecode_offset(target))
            return
          }
          restore_handler_environment(runtime, context, frame, handler)
        }
        const phase = handler_phase(context.handlers, handler)
        const catch_pc = handler_catch_pc(context.handlers, handler)
        if (
          type === COMPLETION_KIND.THROW &&
          phase === HANDLER_PHASE.TRY &&
          catch_pc !== null
        ) {
          handler_enter_catch(context.handlers, handler)
          restore_handler_environment(runtime, context, frame, handler)
          copy_value(
            memory,
            context_frame_register_root(
              context,
              frame,
              handler_exception_register(context.handlers, handler),
            ),
            value,
          )
          context_set_frame_pc(context, frame, catch_pc)
          return
        }
        const finally_pc = handler_finally_pc(context.handlers, handler)
        if (phase !== HANDLER_PHASE.FINALLY && finally_pc !== null) {
          handler_save_completion(context.handlers, handler, type)
          restore_handler_environment(runtime, context, frame, handler)
          copy_value(
            memory,
            handler_completion_value_root(context.handlers, handler),
            value,
          )
          context_set_frame_pc(context, frame, finally_pc)
          return
        }
        pop_handler(runtime, context)
        continue
      }
      if (type === COMPLETION_KIND.JUMP) {
        context_set_frame_pc(
          context,
          frame!,
          bytecode_offset(read_number(memory, value)),
        )
        return
      }
      if (frame === null) {
        copy_value(memory, context_error(context), value)
        context_set_status(context, CONTEXT_STATE.FAILED)
        return
      }
      const caller = context_frame_caller(context, frame)
      if (type === COMPLETION_KIND.RETURN) {
        if (
          context_frame_is_construct_call(context, frame) &&
          !is_object(memory, value)
        )
          copy_value(memory, value, context_frame_this_root(context, frame))
        const destination =
          caller === null
            ? context_result(context)
            : context_frame_return_root(context, frame)!
        copy_value(memory, destination, value)
        pop_frame(runtime, context)
        if (caller === null) context_set_status(context, CONTEXT_STATE.DONE)
        return
      }
      pop_frame(runtime, context)
    }
  } finally {
    free_root(memory, value)
  }
}
