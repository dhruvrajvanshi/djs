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
import type { Root } from "./memory.ts"
import type { Runtime, CodeId } from "../runtime/modules.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type {
  BytecodeOffset,
  RegisterIndex,
  BuiltinPrototype,
} from "../compiler/bytecode.ts"
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
  load_function_environment,
  load_function_receiver,
  load_function_new_target,
  load_value_array_element,
  load_property_setter,
  create_environment,
  copy_environment_bindings,
  environment_at,
  load_binding,
  store_binding,
  get_property,
  set_property,
  private_property,
  set_prototype,
  create_error,
  truthy,
  binary_operation,
  unary_operation,
  to_string,
  create_array,
  define_property,
  delete_property,
  is_object,
} from "./objects.ts"
import {
  call_intrinsic,
  NATIVE_CODE,
  RESUME_CODE,
  INTRINSIC_NAMES,
} from "./intrinsics.ts"
import {
  await_value,
  drain_completions,
  drain_jobs,
  pending_operations,
  wait_for_completion,
} from "../runtime/jobs.ts"

import {
  create_builtin_class,
  install_internal_method,
  register_builtin,
  load_internal_method,
  INTERNAL,
  internal_layout,
  create_builtin_object,
} from "./builtins.ts"
import { define_value_property } from "./properties.ts"
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
  try {
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
  } catch (error) {
    free_root(runtime.memory, context_result(context))
    free_root(runtime.memory, context_error(context))
    throw error
  }
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
  if (!fn) throw new Error("Invalid function descriptor")
  const offset = context_reserve_frame(context, fn.slot_count)
  const allocated_roots = []
  try {
    const env = alloc_root(memory)
    allocated_roots.push(env)
    const this_value = alloc_root(memory)
    allocated_roots.push(this_value)
    copy_value(memory, env, environment)
    if (receiver !== undefined) copy_value(memory, this_value, receiver)
    const target = alloc_root(memory)
    allocated_roots.push(target)
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
      const root = alloc_root(memory)
      allocated_roots.push(root)
      context_set_frame_register_root(
        context,
        offset,
        register_index(index),
        root,
      )
    }
    if (fn.arguments_slot !== null) {
      const args = alloc_root(memory)
      try {
        create_arguments_object(memory, args, arguments_)
        store_binding(runtime, env, fn.arguments_slot, args, true)
      } finally {
        free_root(memory, args)
      }
    }
    for (let index = 0; index < fn.parameter_slots.length; index++) {
      const argument = arguments_[index]
      if (argument === undefined) {
        const empty = alloc_root(memory)
        try {
          store_binding(runtime, env, fn.parameter_slots[index], empty, true)
        } finally {
          free_root(memory, empty)
        }
      } else
        store_binding(runtime, env, fn.parameter_slots[index], argument, true)
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
        store_binding(runtime, env, fn.rest_slot, rest, true)
      } finally {
        free_root(memory, rest)
        free_root(memory, key)
      }
    }
  } catch (error) {
    for (const root of allocated_roots) free_root(memory, root)
    throw error
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
) {
  const { memory } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Value is not callable")
  const hook = alloc_root(memory)
  try {
    if (load_internal_method(memory, hook, callee, INTERNAL.Call)) {
      const args = alloc_root(memory),
        this_argument = alloc_root(memory)
      try {
        create_arguments_object(memory, args, arguments_)
        if (receiver !== undefined) copy_value(memory, this_argument, receiver)
        invoke_sync(runtime, destination, hook, callee, [this_argument, args])
      } finally {
        free_root(memory, args)
        free_root(memory, this_argument)
      }
      return
    }
  } finally {
    free_root(memory, hook)
  }
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
    return
  }
  if (code_id === NATIVE_CODE && INTRINSIC_NAMES[function_id] === "call") {
    call_function(
      runtime,
      context,
      destination,
      arguments_[0],
      arguments_[1],
      arguments_.slice(2),
    )
    return
  }
  if (code_id === NATIVE_CODE) {
    call_intrinsic(runtime, function_id, destination, arguments_)
    return
  }
  if (runtime.code[code_id].unit.functions[function_id].flags & 8) {
    call_async_function(runtime, destination, callee, receiver, arguments_)
    return
  }
  enter_function(runtime, context, destination, callee, receiver, arguments_)
}

function enter_function(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  receiver: Root | undefined,
  arguments_: Root[],
) {
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
    if (flags & 1) throw new TypeError("Class constructor requires new")
    if (flags & 4) {
      load_function_receiver(memory, this_value, callee)
      receiver = this_value
      load_function_new_target(memory, new_target, callee)
    }
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
  } finally {
    free_root(memory, new_target)
    free_root(memory, parent)
    free_root(memory, environment)
    free_root(memory, this_value)
  }
}

// A synchronous language operation may execute user code (valueOf/toString).
// Keep that execution in a rooted VM context and preserve thrown guest values.
class GuestThrow extends Error {
  declare root: Root
  constructor(root: Root) {
    super("Guest exception")
    this.root = root
  }
}

function capture_error(
  runtime: Runtime,
  destination: Root,
  error: HostError | GuestThrow,
) {
  if (error instanceof GuestThrow) {
    copy_value(runtime.memory, destination, error.root)
    free_root(runtime.memory, error.root)
  } else create_error(runtime, destination, error.name, error.message)
}

export function coerce_value(
  runtime: Runtime,
  destination: Root,
  source: Root,
  operation: string,
  hint?: string,
) {
  const helper = runtime.coercions?.get(operation)
  if (helper === undefined) {
    copy_value(runtime.memory, destination, source)
    return
  }
  const hint_value = alloc_root(runtime.memory)
  try {
    if (hint !== undefined) write_string(runtime.memory, hint_value, hint)
    invoke_sync(runtime, destination, helper, undefined, [source, hint_value])
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
) {
  const context = create_call_context(runtime, callee, receiver, args)
  try {
    run_task(runtime, context)
    if (context_status(context) === CONTEXT_STATE.FAILED) {
      const thrown = alloc_root(runtime.memory)
      copy_value(runtime.memory, thrown, context_error(context))
      throw new GuestThrow(thrown)
    }
    if (context_status(context) !== CONTEXT_STATE.DONE)
      throw new TypeError("Internal operations must complete synchronously")
    copy_value(runtime.memory, destination, context_result(context))
  } finally {
    dispose_context(runtime, context)
  }
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
        throw new RangeError("VM instruction limit exceeded")
      const frame = context_current_frame(context)
      if (frame === null) throw new Error("No active frame")
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
      switch (opcode) {
        case OP.LOAD_CONST:
          copy_value(memory, reg(a), code.constants[b])
          break
        case OP.MOVE:
          copy_value(memory, reg(a), reg(b))
          break
        case OP.LOAD_BINDING:
          environment_at(memory, temporary, env, b)
          load_binding(runtime, reg(a), temporary, c)
          break
        case OP.INIT_BINDING:
        case OP.STORE_BINDING:
          environment_at(memory, temporary, env, a)
          store_binding(
            runtime,
            temporary,
            b,
            reg(c),
            opcode === OP.INIT_BINDING,
          )
          break
        case OP.LOAD_GLOBAL: {
          const name = code.unit.literals[b] as string
          const global = runtime.globals.get(name)
          if (global === undefined) {
            if (c === 1)
              write_undefined(memory, reg(a)) // typeof unresolvable name
            else throw new ReferenceError(`${name} is not defined`)
          } else copy_value(memory, reg(a), global)
          break
        }
        case OP.LOAD_NEW_TARGET:
          copy_value(
            memory,
            reg(a),
            context_frame_new_target_root(context, frame),
          )
          break
        case OP.TO_PROPERTY_KEY:
          copy_value(memory, property_key, reg(b))
          if (is_object(memory, property_key))
            coerce_value(runtime, property_key, property_key, "to_string")
          if (kind_of(memory, property_key) === KINDS.SYMBOL)
            copy_value(memory, reg(a), property_key)
          else write_string(memory, reg(a), to_string(memory, property_key))
          break
        case OP.CREATE_ARRAY:
          create_array(memory, reg(a), b)
          break
        case OP.INIT_BUILTIN_CLASS:
          create_builtin_class(memory, reg(a), reg(b), c as BuiltinPrototype)
          break
        case OP.INSTALL_INTERNAL_METHOD:
          install_internal_method(memory, reg(a), reg(b), c)
          break
        case OP.REGISTER_BUILTIN:
          register_builtin(
            memory,
            reg(a),
            reg(b),
            code.unit.literals[c] as string,
          )
          break
        case OP.DELETE_PROP:
          copy_value(memory, property_key, reg(c))
          if (is_object(memory, property_key))
            coerce_value(runtime, property_key, property_key, "to_string")
          write_boolean(
            memory,
            reg(a),
            delete_property(memory, reg(b), property_key),
          )
          break
        case OP.GET_PROP:
          copy_value(memory, property_key, reg(c))
          if (is_object(memory, property_key))
            coerce_value(runtime, property_key, property_key, "to_string")
          if (get_property(memory, reg(a), reg(b), property_key)) {
            if (tag_of(memory, reg(a)) !== TAGS.UNDEFINED)
              call_function(runtime, context, reg(a), reg(a), reg(b), [])
          }
          break
        case OP.SET_PROP: {
          copy_value(memory, property_key, reg(b))
          if (is_object(memory, property_key))
            coerce_value(runtime, property_key, property_key, "to_string")
          copy_value(memory, operand, reg(c))
          const property = set_property(
            memory,
            reg(a),
            property_key,
            operand,
            (_, object, key, value, flags, setter, value_only) =>
              define_value_property(
                runtime,
                object,
                key,
                value,
                flags,
                setter,
                value_only,
              ),
          )
          if (property) {
            load_property_setter(memory, temporary, property)
            if (tag_of(memory, temporary) === TAGS.UNDEFINED)
              throw new TypeError("Property has no setter")
            call_function(
              runtime,
              context,
              context_result(context),
              temporary,
              reg(a),
              [reg(c)],
            )
          }
          break
        }
        case OP.DEFINE_PROP:
          copy_value(memory, property_key, reg(b))
          if (is_object(memory, property_key))
            coerce_value(runtime, property_key, property_key, "to_string")
          copy_value(memory, operand, reg(c))
          define_value_property(
            runtime,
            reg(a),
            property_key,
            operand,
            d,
            e === 1 ? reg(c) : undefined,
          )
          break
        case OP.SET_PROTO:
          set_prototype(memory, reg(a), reg(b))
          break
        case OP.INIT_PRIVATE:
        case OP.SET_PRIVATE:
          private_property(
            memory,
            temporary,
            reg(a),
            reg(b),
            reg(c),
            opcode === OP.INIT_PRIVATE,
            false,
            d === 1,
          )
          break
        case OP.GET_PRIVATE:
        case OP.HAS_PRIVATE:
          private_property(
            memory,
            reg(a),
            reg(b),
            reg(c),
            undefined,
            false,
            opcode === OP.HAS_PRIVATE,
          )
          break
        case OP.CREATE_OBJECT:
          create_object(memory, reg(a))
          break
        case OP.CREATE_CLOSURE:
          create_function(
            memory,
            reg(a),
            code_id,
            b,
            env,
            code.unit.functions[b].flags,
            code.unit.functions[b].flags & 4
              ? context_frame_this_root(context, frame)
              : undefined,
            code.unit.functions[b].flags & 4
              ? context_frame_new_target_root(context, frame)
              : undefined,
            code.unit.functions[b],
          )
          break
        case OP.CALL:
          call_function(
            runtime,
            context,
            reg(a),
            reg(b),
            reg(c),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.CONSTRUCT:
          construct_function(
            runtime,
            context,
            reg(a),
            reg(b),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.PUSH_ENV:
        case OP.COPY_ENV:
          // COPY_ENV replaces the current environment with a sibling holding
          // the same values, giving each loop iteration fresh bindings.
          if (opcode === OP.PUSH_ENV) copy_value(memory, operand, env)
          else environment_at(memory, operand, env, 1)
          create_environment(
            memory,
            temporary,
            operand,
            code.unit.functions[function_id].block_binding_flags[a].length,
            code.block_scope_ids[function_id][a],
          )
          if (opcode === OP.COPY_ENV)
            copy_environment_bindings(memory, temporary, env)
          copy_value(memory, env, temporary)
          break
        case OP.POP_ENV:
          environment_at(memory, temporary, env, a)
          copy_value(memory, env, temporary)
          break
        case OP.JUMP_OUT:
          write_number(memory, temporary, a)
          complete(runtime, context, COMPLETION_KIND.JUMP, temporary)
          break
        case OP.TRY:
          push_handler(
            runtime,
            context,
            frame,
            bytecode_offset(pc),
            optional_bytecode_offset(a),
            optional_bytecode_offset(b),
            bytecode_offset(c),
            register_index(d),
          )
          break
        case OP.LEAVE_TRY:
          leave_handler(runtime, context)
          break
        case OP.END_FINALLY: {
          const handler = context_top_handler(context)!
          const type = handler_completion_kind(context.handlers, handler),
            value = handler_completion_value_root(context.handlers, handler),
            end = handler_end_pc(context.handlers, handler)
          copy_value(memory, temporary, value)
          pop_handler(runtime, context)
          if (type === COMPLETION_KIND.NORMAL)
            context_set_frame_pc(context, frame, end)
          else complete(runtime, context, type, temporary)
          if (
            ([CONTEXT_STATE.DONE, CONTEXT_STATE.FAILED] as number[]).includes(
              context_status(context),
            )
          )
            return
          break
        }
        case OP.RETURN:
          complete(runtime, context, COMPLETION_KIND.RETURN, reg(a))
          if (context_status(context) === CONTEXT_STATE.DONE) return
          break
        case OP.AWAIT:
          await_value(runtime, context, reg(a), reg(b))
          return
        case OP.THROW:
          complete(runtime, context, COMPLETION_KIND.THROW, reg(a))
          if (context_status(context) === CONTEXT_STATE.FAILED) return
          break
        case OP.JUMP:
          context_set_frame_pc(context, frame, bytecode_offset(a))
          break
        case OP.JUMP_IF_FALSY:
          if (!truthy(memory, reg(a)))
            context_set_frame_pc(context, frame, bytecode_offset(b))
          break
        case OP.BINARY_OP: {
          const operator = code.unit.literals[d] as string
          copy_value(memory, temporary, reg(b))
          copy_value(memory, operand, reg(c))
          if (operator === "in") {
            if (!is_object(memory, operand))
              throw new TypeError("Right operand of in must be an object")
            if (is_object(memory, temporary))
              coerce_value(runtime, temporary, temporary, "to_string")
          } else if (!["===", "!==", "instanceof"].includes(operator)) {
            const loose = operator === "==" || operator === "!="
            const left_object = is_object(memory, temporary),
              right_object = is_object(memory, operand)
            const nullish =
              ([TAGS.NULL, TAGS.UNDEFINED] as number[]).includes(
                tag_of(memory, temporary),
              ) ||
              ([TAGS.NULL, TAGS.UNDEFINED] as number[]).includes(
                tag_of(memory, operand),
              )
            if (!loose || (left_object !== right_object && !nullish)) {
              if (left_object)
                coerce_value(
                  runtime,
                  temporary,
                  temporary,
                  "to_primitive",
                  operator === "+" || loose ? undefined : "number",
                )
              if (right_object)
                coerce_value(
                  runtime,
                  operand,
                  operand,
                  "to_primitive",
                  operator === "+" || loose ? undefined : "number",
                )
            }
          }
          binary_operation(memory, reg(a), temporary, operand, operator)
          break
        }
        case OP.UNARY_OP:
          copy_value(memory, operand, reg(b))
          if (
            ["+", "-", "~"].includes(code.unit.literals[c] as string) &&
            is_object(memory, operand)
          )
            coerce_value(runtime, operand, operand, "to_number")
          unary_operation(
            memory,
            reg(a),
            operand,
            code.unit.literals[c] as string,
          )
          break
        case OP.LOAD_THIS:
          copy_value(memory, reg(a), context_frame_this_root(context, frame))
          break
        default:
          throw new Error(`Unknown opcode: ${opcode}`)
      }
      // The helper root must not retain environments after the instruction.
      write_undefined(memory, temporary)
      write_undefined(memory, operand)
      write_undefined(memory, property_key)
    }
    context_set_status(context, CONTEXT_STATE.READY)
  } catch (error) {
    capture_error(runtime, temporary, error)
    complete(runtime, context, COMPLETION_KIND.THROW, temporary)
    if (context_status(context) !== CONTEXT_STATE.FAILED)
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
) {
  if (runtime.promise_capability === undefined)
    throw new Error("Promise is not initialized")
  const { memory } = runtime
  const key = alloc_root(memory),
    resolve = alloc_root(memory),
    reject = alloc_root(memory)
  let capability
  try {
    capability = create_call_context(
      runtime,
      runtime.promise_capability,
      undefined,
      [],
    )
    run_task(runtime, capability)
    if (context_status(capability) === CONTEXT_STATE.FAILED)
      throw new Error(to_string(memory, context_error(capability)))
    for (const [name, target] of [
      ["promise", destination],
      ["resolve", resolve],
      ["reject", reject],
    ] as [string, Root][]) {
      write_string(memory, key, name)
      get_property(memory, target, context_result(capability), key)
    }
  } catch (error) {
    free_root(memory, resolve)
    free_root(memory, reject)
    throw error
  } finally {
    if (capability) dispose_context(runtime, capability)
    free_root(memory, key)
  }
  const context = create_empty_context(runtime)
  context.settle = { resolve, reject }
  try {
    enter_function(
      runtime,
      context,
      context_result(context),
      callee,
      receiver,
      arguments_,
    )
  } catch (error) {
    capture_error(runtime, context_error(context), error)
    context_set_status(context, CONTEXT_STATE.FAILED)
  }
  run_task(runtime, context)
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
  try {
    call_function(
      runtime,
      context,
      context_result(context),
      callee,
      receiver,
      arguments_,
    )
    if (context_current_frame(context) === null)
      context_set_status(context, CONTEXT_STATE.DONE)
  } catch (error) {
    capture_error(runtime, context_error(context), error)
    context_set_status(context, CONTEXT_STATE.FAILED)
  }
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

function construct_function(
  runtime: Runtime,
  context: Context,
  destination: Root,
  callee: Root,
  arguments_: Root[],
) {
  const { memory } = runtime
  if (kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Value is not a constructor")
  const hook = alloc_root(memory)
  try {
    if (load_internal_method(memory, hook, callee, INTERNAL.Construct)) {
      const args = alloc_root(memory)
      try {
        create_arguments_object(memory, args, arguments_)
        invoke_sync(runtime, destination, hook, callee, [args, callee])
        if (!is_object(memory, destination))
          throw new TypeError("Construct must return an object")
      } finally {
        free_root(memory, args)
      }
      return
    }
  } finally {
    free_root(memory, hook)
  }
  const code = function_code_id(memory, callee),
    id = callee_function_id(memory, callee)
  if (
    code === NATIVE_CODE ||
    code === RESUME_CODE ||
    runtime.code[code].unit.functions[id].flags & 14
  )
    throw new TypeError("Value is not a constructor")
  const receiver = alloc_root(memory),
    key = alloc_root(memory),
    prototype = alloc_root(memory),
    parent = alloc_root(memory),
    environment = alloc_root(memory)
  try {
    load_function_environment(memory, parent, callee)
    create_object(memory, receiver)
    // Constructors in the supported subset have data-valued prototype properties.
    const { unit, scope_ids } = runtime.code[code],
      fn = unit.functions[id]
    write_string(memory, key, "prototype")
    get_property(memory, prototype, callee, key)
    if (is_object(memory, prototype)) set_prototype(memory, receiver, prototype)
    if (internal_layout(memory, callee, true)) {
      if (!is_object(memory, prototype))
        copy_value(memory, prototype, runtime.memory.object_prototype!)
      create_builtin_object(memory, receiver, callee, prototype)
    }
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
  try {
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
  } catch (error) {
    free_root(runtime.memory, completion_value_root)
    free_root(runtime.memory, environment_root)
    throw error
  }
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
