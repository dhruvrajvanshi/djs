import {
  OP,
  INSTRUCTION_BYTES,
  decode_instruction,
} from "../compiler/bytecode.js"
import {
  alloc_root,
  free_root,
  copy_value,
  copy_heap_value_to_root,
  read_u32,
} from "./memory.js"
import {
  get_ref,
  read_number,
  read_boolean,
  write_undefined,
  tag_of,
  write_string,
} from "./values.js"
import { KINDS, TAGS } from "./memory.js"
import {
  kind_of,
  create_object,
  create_arguments_object,
  create_function,
  create_environment,
  environment_at,
  load_binding,
  store_binding,
  get_property,
  set_property,
  define_property,
  private_property,
  set_prototype,
  create_error,
  truthy,
  binary_operation,
  unary_operation,
  to_string,
} from "./objects.js"
import {
  call_intrinsic,
  NATIVE_CODE,
  RESUME_CODE,
  INTRINSIC_NAMES,
} from "./intrinsics.js"
import {
  CONTEXT_STATE,
  await_value,
  drain_completions,
  drain_jobs,
  pending_operations,
  wait_for_completion,
} from "../runtime/jobs.js"

const NONE = 0xffffffff
const FRAME_BYTES = 40
const F = Object.freeze({
  CALLER: 0,
  CODE: 4,
  FUNCTION: 8,
  PC: 12,
  RETURN: 16,
  ENV: 20,
  THIS: 24,
  COUNT: 28,
  CONSTRUCT: 32,
})
export const C = Object.freeze({
  STATUS: 0,
  FRAME: 4,
  USED: 8,
  RESULT: 12,
  ERROR: 16,
  STEPS: 20,
  HANDLERS: 24,
  REJECTED: 28,
})

function context_view(context) {
  return new DataView(context.control.buffer)
}
function frame_view(context) {
  return new DataView(context.frames.buffer)
}
export function context_status(context) {
  return context_view(context).getUint32(C.STATUS, true)
}
export function context_result(context) {
  return context_view(context).getUint32(C.RESULT, true)
}
export function context_error(context) {
  return context_view(context).getUint32(C.ERROR, true)
}

function register(context, frame, index) {
  const view = frame_view(context)
  if (index >= view.getUint32(frame + F.COUNT, true))
    throw new RangeError("Invalid register index")
  return view.getUint32(frame + FRAME_BYTES + index * 4, true)
}

export function create_context(runtime, code_id, environment) {
  const context = {
    id: runtime.contexts.length,
    control: new Uint8Array(32),
    frames: new Uint8Array(1024),
    handlers: new Uint8Array(256),
  }
  context_view(context).setUint32(C.FRAME, NONE, true)
  context_view(context).setUint32(C.RESULT, alloc_root(runtime.memory), true)
  context_view(context).setUint32(C.ERROR, alloc_root(runtime.memory), true)
  try {
    push_frame(
      runtime,
      context,
      code_id,
      runtime.code[code_id].unit.entry,
      environment,
      undefined,
      [],
      NONE,
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
  runtime,
  context,
  code_id,
  function_id,
  environment,
  receiver,
  arguments_,
  destination,
) {
  const { memory } = runtime
  const fn = runtime.code[code_id].unit.functions[function_id]
  if (!fn) throw new Error("Invalid function descriptor")
  const control = context_view(context)
  const offset = control.getUint32(C.USED, true)
  const required = offset + FRAME_BYTES + fn.slot_count * 4
  if (required > context.frames.length) {
    const frames = new Uint8Array(Math.max(required, context.frames.length * 2))
    frames.set(context.frames)
    context.frames = frames
  }
  const view = frame_view(context)
  view.setUint32(offset + F.CALLER, control.getUint32(C.FRAME, true), true)
  view.setUint32(offset + F.CODE, code_id, true)
  view.setUint32(offset + F.FUNCTION, function_id, true)
  view.setUint32(offset + F.PC, 0, true)
  view.setUint32(offset + F.CONSTRUCT, 0, true)
  view.setUint32(offset + F.RETURN, destination, true)
  const allocated_roots = []
  try {
    const env = alloc_root(memory)
    allocated_roots.push(env)
    const this_value = alloc_root(memory)
    allocated_roots.push(this_value)
    copy_value(memory, env, environment)
    if (receiver !== undefined) copy_value(memory, this_value, receiver)
    view.setUint32(offset + F.ENV, env, true)
    view.setUint32(offset + F.THIS, this_value, true)
    view.setUint32(offset + F.COUNT, fn.slot_count, true)
    for (let index = 0; index < fn.slot_count; index++) {
      const root = alloc_root(memory)
      allocated_roots.push(root)
      view.setUint32(offset + FRAME_BYTES + index * 4, root, true)
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
  } catch (error) {
    for (const root of allocated_roots) free_root(memory, root)
    throw error
  }
  control.setUint32(C.FRAME, offset, true)
  control.setUint32(C.USED, required, true)
}

function pop_frame(runtime, context) {
  const control = context_view(context),
    view = frame_view(context)
  const frame = control.getUint32(C.FRAME, true)
  for (let index = 0; index < view.getUint32(frame + F.COUNT, true); index++) {
    free_root(runtime.memory, register(context, frame, index))
  }
  free_root(runtime.memory, view.getUint32(frame + F.ENV, true))
  free_root(runtime.memory, view.getUint32(frame + F.THIS, true))
  control.setUint32(C.FRAME, view.getUint32(frame + F.CALLER, true), true)
  control.setUint32(C.USED, frame, true)
}

export function dispose_context(runtime, context) {
  if (context_status(context) === CONTEXT_STATE.DISPOSED) return
  while (top_handler(context)) pop_handler(runtime, context)
  while (context_view(context).getUint32(C.FRAME, true) !== NONE)
    pop_frame(runtime, context)
  free_root(runtime.memory, context_result(context))
  free_root(runtime.memory, context_error(context))
  context_view(context).setUint32(C.STATUS, CONTEXT_STATE.DISPOSED, true)
}

function call_function(
  runtime,
  context,
  destination,
  callee,
  receiver,
  arguments_,
) {
  const { memory } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Value is not callable")
  const reference = get_ref(memory, callee)
  const code_id = read_u32(memory, reference + 8),
    function_id = read_u32(memory, reference + 12)
  if (code_id === RESUME_CODE) {
    const captured = alloc_root(memory),
      value = alloc_root(memory)
    try {
      copy_heap_value_to_root(memory, captured, reference + 16)
      copy_heap_value_to_root(memory, value, get_ref(memory, captured) + 16)
      const target = read_number(memory, value)
      copy_heap_value_to_root(memory, value, get_ref(memory, captured) + 24)
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
  const parent = alloc_root(memory),
    environment = alloc_root(memory),
    this_value = alloc_root(memory)
  try {
    copy_heap_value_to_root(memory, parent, reference + 16)
    const fn = runtime.code[code_id].unit.functions[function_id]
    const flags = read_u32(memory, reference + 32)
    if (flags & 1) throw new TypeError("Class constructor requires new")
    if (flags & 4) {
      copy_heap_value_to_root(memory, this_value, reference + 40)
      receiver = this_value
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
    )
  } finally {
    free_root(memory, parent)
    free_root(memory, environment)
    free_root(memory, this_value)
  }
}

export function run_interpreter(runtime, context) {
  const { memory } = runtime
  const control = context_view(context)
  control.setUint32(C.STATUS, CONTEXT_STATE.RUNNING, true)
  if (context.module_state)
    new DataView(context.module_state.buffer).setUint32(0, 2, true) // evaluating
  const temporary = alloc_root(memory)
  try {
    if (control.getUint32(C.REJECTED, true)) {
      control.setUint32(C.REJECTED, 0, true)
      complete(runtime, context, 2, context_error(context))
      if (context_status(context) === CONTEXT_STATE.FAILED) return
    }
    // run_task preserves run-to-completion across these bounded slices.
    for (let slice = 0; slice < 10000; slice++) {
      const steps = control.getUint32(C.STEPS, true) + 1
      control.setUint32(C.STEPS, steps, true)
      const budget = new DataView(runtime.scheduler.control.buffer)
      const task_steps = budget.getUint32(16, true) + 1
      budget.setUint32(16, task_steps, true)
      if (steps > runtime.max_steps || task_steps > runtime.max_steps)
        throw new RangeError("VM instruction limit exceeded")
      const frame = control.getUint32(C.FRAME, true)
      const view = frame_view(context)
      const code_id = view.getUint32(frame + F.CODE, true)
      const function_id = view.getUint32(frame + F.FUNCTION, true)
      const code = runtime.code[code_id]
      const pc = view.getUint32(frame + F.PC, true)
      const { opcode, a, b, c, d, e } = decode_instruction(
        code.bytecodes[function_id],
        pc,
      )
      view.setUint32(frame + F.PC, pc + INSTRUCTION_BYTES, true)
      const reg = (index) => register(context, frame, index)
      const env = view.getUint32(frame + F.ENV, true)
      switch (opcode) {
        case OP.CONST:
          copy_value(memory, reg(a), code.constants[b])
          break
        case OP.MOVE:
          copy_value(memory, reg(a), reg(b))
          break
        case OP.LOAD_ENV:
          environment_at(memory, temporary, env, b)
          load_binding(runtime, reg(a), temporary, c)
          break
        case OP.INIT_ENV:
        case OP.STORE_ENV:
          environment_at(memory, temporary, env, a)
          store_binding(runtime, temporary, b, reg(c), opcode === OP.INIT_ENV)
          break
        case OP.LOAD_GLOBAL: {
          const name = code.unit.literals[b]
          const global = runtime.globals.get(name)
          if (global === undefined) {
            if (c === 1)
              write_undefined(memory, reg(a)) // typeof unresolvable name
            else throw new ReferenceError(`${name} is not defined`)
          } else copy_value(memory, reg(a), global)
          break
        }
        case OP.GET_PROP:
          if (get_property(memory, reg(a), reg(b), reg(c))) {
            if (tag_of(memory, reg(a)) !== TAGS.UNDEFINED)
              call_function(runtime, context, reg(a), reg(a), reg(b), [])
          }
          break
        case OP.SET_PROP: {
          const property = set_property(memory, reg(a), reg(b), reg(c))
          if (property) {
            copy_heap_value_to_root(memory, temporary, property + 32)
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
          define_property(
            memory,
            reg(a),
            reg(b),
            reg(c),
            d,
            e === 1 ? reg(c) : undefined,
          )
          break
        case OP.SET_PROTO:
          set_prototype(memory, reg(a), reg(b))
          break
        case OP.PRIVATE_INIT:
        case OP.PRIVATE_SET:
          private_property(
            memory,
            temporary,
            reg(a),
            reg(b),
            reg(c),
            opcode === OP.PRIVATE_INIT,
            false,
            d === 1,
          )
          break
        case OP.PRIVATE_GET:
        case OP.PRIVATE_HAS:
          private_property(
            memory,
            reg(a),
            reg(b),
            reg(c),
            undefined,
            false,
            opcode === OP.PRIVATE_HAS,
          )
          break
        case OP.OBJECT:
          create_object(memory, reg(a))
          break
        case OP.CLOSURE:
          create_function(
            memory,
            reg(a),
            code_id,
            b,
            env,
            code.unit.functions[b].flags,
            code.unit.functions[b].flags & 4
              ? view.getUint32(frame + F.THIS, true)
              : undefined,
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
        case OP.TRY:
          push_handler(runtime, context, frame, a, b, c, d)
          break
        case OP.LEAVE_TRY:
          leave_handler(runtime, context)
          break
        case OP.END_FINALLY: {
          const handler = top_handler(context)
          const type = handler.getUint32(24, true),
            value = handler.getUint32(28, true),
            end = handler.getUint32(12, true)
          copy_value(memory, temporary, value)
          pop_handler(runtime, context)
          if (type === 0) frame_view(context).setUint32(frame + F.PC, end, true)
          else complete(runtime, context, type, temporary)
          if (
            [CONTEXT_STATE.DONE, CONTEXT_STATE.FAILED].includes(
              context_status(context),
            )
          )
            return
          break
        }
        case OP.RETURN:
          complete(runtime, context, 1, reg(a))
          if (context_status(context) === CONTEXT_STATE.DONE) return
          break
        case OP.AWAIT:
          await_value(runtime, context, reg(a), reg(b))
          return
        case OP.THROW:
          complete(runtime, context, 2, reg(a))
          if (context_status(context) === CONTEXT_STATE.FAILED) return
          break
        case OP.JUMP:
          view.setUint32(frame + F.PC, a, true)
          break
        case OP.JUMP_IF_FALSE:
          if (!truthy(memory, reg(a))) view.setUint32(frame + F.PC, b, true)
          break
        case OP.BINARY:
          binary_operation(
            memory,
            reg(a),
            reg(b),
            reg(c),
            code.unit.literals[d],
          )
          break
        case OP.UNARY:
          unary_operation(memory, reg(a), reg(b), code.unit.literals[c])
          break
        case OP.LOAD_THIS:
          copy_value(memory, reg(a), view.getUint32(frame + F.THIS, true))
          break
        default:
          throw new Error(`Unknown opcode: ${opcode}`)
      }
      // The helper root must not retain environments after the instruction.
      write_undefined(memory, temporary)
    }
    control.setUint32(C.STATUS, CONTEXT_STATE.READY, true)
  } catch (error) {
    create_error(runtime, temporary, error.name, error.message)
    complete(runtime, context, 2, temporary)
    if (context_status(context) !== CONTEXT_STATE.FAILED)
      control.setUint32(C.STATUS, CONTEXT_STATE.READY, true)
  } finally {
    free_root(memory, temporary)
  }
}

export function run_task(runtime, context) {
  while (
    context_status(context) === CONTEXT_STATE.READY ||
    context_status(context) === CONTEXT_STATE.RUNNING
  )
    run_interpreter(runtime, context)
}

export async function evaluate_context(runtime, context) {
  // Include all callbacks and await helpers in this module evaluation's budget.
  new DataView(runtime.scheduler.control.buffer).setUint32(16, 0, true)
  run_task(runtime, context)
  while (true) {
    drain_completions(runtime)
    drain_jobs(runtime)
    if (context_status(context) === CONTEXT_STATE.READY)
      run_task(runtime, context)
    if (context_status(context) === CONTEXT_STATE.FAILED)
      throw new Error(to_string(runtime.memory, context_error(context)))
    const scheduler = new DataView(runtime.scheduler.control.buffer)
    if (
      scheduler.getUint32(4, true) !== 0 ||
      runtime.scheduler.completions.length !== 0
    )
      continue
    if (pending_operations(runtime) !== 0) {
      await wait_for_completion(runtime)
      continue
    }
    if (context_status(context) === CONTEXT_STATE.DONE) return
    const error = new Error("Top-level await did not settle")
    error.exit_code = 13
    throw error
  }
}

export function create_call_context(runtime, callee, receiver, arguments_) {
  const context = {
    id: runtime.contexts.length,
    control: new Uint8Array(32),
    frames: new Uint8Array(1024),
    handlers: new Uint8Array(256),
  }
  const control = context_view(context)
  control.setUint32(C.FRAME, NONE, true)
  control.setUint32(C.RESULT, alloc_root(runtime.memory), true)
  control.setUint32(C.ERROR, alloc_root(runtime.memory), true)
  runtime.contexts.push(context)
  try {
    call_function(
      runtime,
      context,
      context_result(context),
      callee,
      receiver,
      arguments_,
    )
    if (control.getUint32(C.FRAME, true) === NONE)
      control.setUint32(C.STATUS, CONTEXT_STATE.DONE, true)
  } catch (error) {
    create_error(runtime, context_error(context), error.name, error.message)
    control.setUint32(C.STATUS, CONTEXT_STATE.FAILED, true)
  }
  return context
}

export function resume_context(
  runtime,
  context,
  destination,
  argument,
  rejected,
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
  context_view(context).setUint32(C.REJECTED, rejected ? 1 : 0, true)
  context_view(context).setUint32(C.STATUS, CONTEXT_STATE.READY, true)
}

function construct_function(runtime, context, destination, callee, arguments_) {
  const { memory } = runtime
  if (kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Value is not a constructor")
  const reference = get_ref(memory, callee),
    code = read_u32(memory, reference + 8),
    id = read_u32(memory, reference + 12)
  if (
    code === NATIVE_CODE ||
    code === RESUME_CODE ||
    runtime.code[code].unit.functions[id].flags & 6
  )
    throw new TypeError("Value is not a constructor")
  const receiver = alloc_root(memory),
    key = alloc_root(memory),
    prototype = alloc_root(memory),
    parent = alloc_root(memory),
    environment = alloc_root(memory)
  try {
    copy_heap_value_to_root(memory, parent, reference + 16)
    create_object(memory, receiver)
    // Constructors in the supported subset have data-valued prototype properties.
    const { unit, scope_ids } = runtime.code[code],
      fn = unit.functions[id]
    write_string(memory, key, "prototype")
    get_property(memory, prototype, callee, key)
    if (
      [KINDS.OBJECT, KINDS.FUNCTION, KINDS.ERROR].includes(
        kind_of(memory, prototype),
      )
    )
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
    )
    frame_view(context).setUint32(
      context_view(context).getUint32(C.FRAME, true) + F.CONSTRUCT,
      1,
      true,
    )
  } finally {
    for (const root of [receiver, key, prototype, parent, environment])
      free_root(memory, root)
  }
}

const HANDLER_BYTES = 32
function top_handler(context) {
  const count = context_view(context).getUint32(C.HANDLERS, true)
  return count === 0
    ? null
    : new DataView(
        context.handlers.buffer,
        (count - 1) * HANDLER_BYTES,
        HANDLER_BYTES,
      )
}
function push_handler(
  runtime,
  context,
  frame,
  catch_pc,
  finally_pc,
  end_pc,
  exception,
) {
  const control = context_view(context),
    count = control.getUint32(C.HANDLERS, true)
  if ((count + 1) * HANDLER_BYTES > context.handlers.length) {
    const bytes = new Uint8Array(context.handlers.length * 2)
    bytes.set(context.handlers)
    context.handlers = bytes
  }
  control.setUint32(C.HANDLERS, count + 1, true)
  const handler = top_handler(context)
  for (const [offset, value] of [
    [0, frame],
    [4, catch_pc],
    [8, finally_pc],
    [12, end_pc],
    [16, exception],
    [20, 0],
    [24, 0],
    [28, alloc_root(runtime.memory)],
  ])
    handler.setUint32(offset, value, true)
}
function pop_handler(runtime, context) {
  free_root(runtime.memory, top_handler(context).getUint32(28, true))
  const control = context_view(context)
  control.setUint32(C.HANDLERS, control.getUint32(C.HANDLERS, true) - 1, true)
}
function leave_handler(runtime, context) {
  const handler = top_handler(context),
    frame = handler.getUint32(0, true)
  if (handler.getUint32(8, true) !== NONE) {
    handler.setUint32(20, 2, true)
    handler.setUint32(24, 0, true)
    frame_view(context).setUint32(
      frame + F.PC,
      handler.getUint32(8, true),
      true,
    )
  } else {
    const end = handler.getUint32(12, true)
    pop_handler(runtime, context)
    frame_view(context).setUint32(frame + F.PC, end, true)
  }
}

// Completion types: 0 normal, 1 return, 2 throw. Finally preserves the original
// value in a root until it resumes, or a new abrupt completion replaces it.
function complete(runtime, context, type, source) {
  const { memory } = runtime
  const value = alloc_root(memory)
  copy_value(memory, value, source)
  try {
    while (true) {
      const control = context_view(context),
        frame = control.getUint32(C.FRAME, true),
        view = frame_view(context)
      const handler = top_handler(context)
      if (handler && handler.getUint32(0, true) === frame) {
        const phase = handler.getUint32(20, true)
        if (type === 2 && phase === 0 && handler.getUint32(4, true) !== NONE) {
          handler.setUint32(20, 1, true)
          copy_value(
            memory,
            register(context, frame, handler.getUint32(16, true)),
            value,
          )
          view.setUint32(frame + F.PC, handler.getUint32(4, true), true)
          return
        }
        if (phase !== 2 && handler.getUint32(8, true) !== NONE) {
          handler.setUint32(20, 2, true)
          handler.setUint32(24, type, true)
          copy_value(memory, handler.getUint32(28, true), value)
          view.setUint32(frame + F.PC, handler.getUint32(8, true), true)
          return
        }
        pop_handler(runtime, context)
        continue
      }
      if (frame === NONE) {
        copy_value(memory, context_error(context), value)
        control.setUint32(C.STATUS, CONTEXT_STATE.FAILED, true)
        return
      }
      const caller = view.getUint32(frame + F.CALLER, true)
      if (type === 1) {
        if (
          view.getUint32(frame + F.CONSTRUCT, true) &&
          ![KINDS.OBJECT, KINDS.FUNCTION, KINDS.ERROR].includes(
            kind_of(memory, value),
          )
        )
          copy_value(memory, value, view.getUint32(frame + F.THIS, true))
        const destination =
          caller === NONE
            ? context_result(context)
            : view.getUint32(frame + F.RETURN, true)
        copy_value(memory, destination, value)
        pop_frame(runtime, context)
        if (caller === NONE)
          control.setUint32(C.STATUS, CONTEXT_STATE.DONE, true)
        return
      }
      pop_frame(runtime, context)
    }
  } finally {
    free_root(memory, value)
  }
}
