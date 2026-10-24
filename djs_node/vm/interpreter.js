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
import { get_ref, write_string, write_undefined } from "./values.js"
import { KINDS } from "./memory.js"
import {
  kind_of,
  create_object,
  create_function,
  create_environment,
  environment_at,
  load_binding,
  store_binding,
  get_property,
  set_property,
  truthy,
  binary_operation,
  unary_operation,
  to_string,
} from "./objects.js"
import { intrinsic_id, call_intrinsic, NATIVE_CODE } from "./intrinsics.js"
import {
  CONTEXT_STATE,
  await_value,
  drain_completions,
  drain_jobs,
  pending_operations,
  wait_for_completion,
} from "../runtime/jobs.js"

const NONE = 0xffffffff
const FRAME_BYTES = 32
const F = Object.freeze({
  CALLER: 0,
  CODE: 4,
  FUNCTION: 8,
  PC: 12,
  RETURN: 16,
  ENV: 20,
  THIS: 24,
  COUNT: 28,
})
export const C = Object.freeze({
  STATUS: 0,
  FRAME: 4,
  USED: 8,
  RESULT: 12,
  ERROR: 16,
  STEPS: 20,
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
  if (kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Value is not callable")
  const reference = get_ref(memory, callee)
  const code_id = read_u32(memory, reference + 8),
    function_id = read_u32(memory, reference + 12)
  if (code_id === NATIVE_CODE) {
    call_intrinsic(runtime, function_id, destination, arguments_)
    return
  }
  const parent = alloc_root(memory),
    environment = alloc_root(memory)
  try {
    copy_heap_value_to_root(memory, parent, reference + 16)
    const fn = runtime.code[code_id].unit.functions[function_id]
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
    // A bounded slice lets the scheduler process jobs between long-running frames.
    for (let slice = 0; slice < 10000; slice++) {
      const steps = control.getUint32(C.STEPS, true) + 1
      control.setUint32(C.STEPS, steps, true)
      if (steps > runtime.max_steps)
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
          get_property(memory, reg(a), reg(b), reg(c))
          break
        case OP.SET_PROP:
          set_property(memory, reg(a), reg(b), reg(c))
          break
        case OP.OBJECT:
          create_object(memory, reg(a))
          break
        case OP.CLOSURE:
          create_function(memory, reg(a), code_id, b, env)
          break
        case OP.INTRINSIC:
          create_function(
            memory,
            reg(a),
            NATIVE_CODE,
            intrinsic_id(code.unit.literals[b]),
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
        case OP.RETURN: {
          const caller = view.getUint32(frame + F.CALLER, true)
          const destination =
            caller === NONE
              ? context_result(context)
              : view.getUint32(frame + F.RETURN, true)
          copy_value(memory, destination, reg(a))
          pop_frame(runtime, context)
          if (caller === NONE) {
            control.setUint32(C.STATUS, CONTEXT_STATE.DONE, true)
            return
          }
          break
        }
        case OP.AWAIT:
          await_value(runtime, context, reg(a), reg(b))
          return
        case OP.THROW:
          copy_value(memory, context_error(context), reg(a))
          control.setUint32(C.STATUS, CONTEXT_STATE.FAILED, true)
          return
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
    // No guest catch handlers in the initial subset. Preserve an uncaught error
    // as a rooted guest string and let module evaluation fail at the boundary.
    write_string(
      memory,
      context_error(context),
      `${error.name}: ${error.message}`,
    )
    control.setUint32(C.STATUS, CONTEXT_STATE.FAILED, true)
  } finally {
    free_root(memory, temporary)
  }
}

export async function evaluate_context(runtime, context) {
  while (
    context_status(context) !== CONTEXT_STATE.DONE &&
    context_status(context) !== CONTEXT_STATE.FAILED
  ) {
    drain_completions(runtime)
    drain_jobs(runtime)
    for (const active of runtime.contexts) {
      if (context_status(active) === CONTEXT_STATE.READY)
        run_interpreter(runtime, active)
    }
    if (context_status(context) === CONTEXT_STATE.WAITING) {
      const scheduler_view = new DataView(runtime.scheduler.control.buffer)
      if (
        scheduler_view.getUint32(4, true) !== 0 ||
        runtime.scheduler.completions.length !== 0
      )
        continue
      if (pending_operations(runtime) === 0) {
        const error = new Error("Top-level await did not settle")
        error.exit_code = 13
        throw error
      }
      await wait_for_completion(runtime)
    }
  }
  if (context_status(context) === CONTEXT_STATE.FAILED) {
    throw new Error(to_string(runtime.memory, context_error(context)))
  }
}
