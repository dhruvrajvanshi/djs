import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import {
  TAGS,
  is_nullish,
  kind_of,
  read_number,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import type { FunctionId } from "../../compiler/compile.ts"
import type { BytecodeOffset, RegisterIndex } from "../../compiler/bytecode.ts"
import {
  OP,
  INSTRUCTION_BYTES,
  decode_instruction,
  register_index,
  bytecode_offset,
  optional_bytecode_offset,
} from "../../compiler/bytecode.ts"
import type { HostError } from "../../host/node.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import type { CodeId, LinkedCode } from "../../runtime/modules.ts"
import { MODULE_STATE } from "../../runtime/modules.ts"
import {
  drain_completions,
  drain_jobs,
  wait_for_completion,
} from "../../runtime/scheduler.ts"
import { write_string } from "../records/string.ts"
import {
  has_property_list,
  is_object,
  set_prototype,
} from "../records/object.ts"
import { set_builtin_steps } from "../records/function.ts"
import {
  copy_environment_bindings,
  create_environment,
  environment_at,
} from "../records/environment.ts"
import {
  create_array,
  create_function,
  create_object,
  create_string_object,
} from "../semantics/objects.ts"
import {
  define_value_property,
  delete_property,
  for_in_keys,
  get_property,
  has_properties,
  has_property,
  private_property,
  set_property,
} from "../semantics/properties.ts"
import {
  binary_operation,
  to_string,
  truthy,
  unary_operation,
} from "../semantics/operations.ts"
import {
  initialize_binding,
  load_binding,
  store_binding,
} from "../semantics/bindings.ts"
import { init_slot } from "../semantics/slots.ts"
import { OK, THROW, throw_error, clear_exception } from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"
import {
  CONTEXT_STATE,
  COMPLETION_KIND,
  HANDLER_PHASE,
  Handler,
} from "./context.ts"
import type {
  CompletionKind,
  Context,
  ContextStatus,
  Frame,
} from "./context.ts"
import {
  await_value,
  call_function,
  pop_frame,
  settle_async_function,
  coerce_value,
  construct_function,
  invoke_sync,
} from "./calls.ts"

function check_properties(runtime: Runtime, value: Root): Status {
  if (!has_properties(runtime, value))
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
    get_property(runtime, destination, object, key) &&
    tag_of(runtime.memory, destination) !== TAGS.UNDEFINED
  )
    return invoke_sync(runtime, destination, destination, object, [])
  return OK
}

function close_iterator(runtime: Runtime, iterator: Root): Status {
  const { memory } = runtime
  const method = memory.alloc_root(),
    result = memory.alloc_root()
  try {
    const key = runtime.realm.property_names.get("return")!
    if (get_value(runtime, method, iterator, key) === THROW) return THROW
    if (is_nullish(memory, method)) return OK
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
    memory.free_root(method)
    memory.free_root(result)
  }
}

function load_property_key(
  runtime: Runtime,
  destination: Root,
  source: Root,
): Status {
  runtime.memory.copy_value(destination, source)
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
    memory.copy_value(destination, constant)
  },
  MOVE(memory: Memory, destination: Root, source: Root) {
    memory.copy_value(destination, source)
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
    const global = runtime.realm.globals.get(name)
    if (global === undefined) {
      if (allow_unresolved)
        write_undefined(runtime.memory, destination) // typeof unresolvable name
      else
        return throw_error(runtime, "ReferenceError", `${name} is not defined`)
    } else runtime.memory.copy_value(destination, global)
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
    if (is_nullish(memory, iterable))
      return throw_error(runtime, "TypeError", "Value is not iterable")
    if (
      get_value(
        runtime,
        temporary,
        iterable,
        runtime.realm.well_known_symbols.get("iterator")!,
      ) === THROW
    )
      return THROW
    if (is_nullish(memory, temporary))
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
      runtime.realm.property_names.get("next")!,
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
    const done = runtime.realm.property_names.get("done")!
    if (get_value(runtime, operand, temporary, done) === THROW) return THROW
    if (truthy(runtime, operand)) {
      frame.pc = bytecode_offset(done_target)
      return OK
    }
    return get_value(
      runtime,
      destination,
      temporary,
      runtime.realm.property_names.get("value")!,
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
      create_string_object(runtime, object, source)
    else memory.copy_value(object, source)
    if (!is_object(memory, object)) create_array(runtime, keys, 0)
    else if (has_property_list(memory, object))
      for_in_keys(runtime, keys, object)
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
      runtime,
      temporary,
      keys,
      runtime.realm.property_names.get("length")!,
    )
    const length = read_number(memory, temporary)
    let found = false
    while (!found && index < length) {
      write_number(memory, operand, index)
      index++
      get_property(runtime, temporary, keys, operand)
      if (has_property(runtime, object, temporary)) {
        memory.copy_value(destination, temporary)
        found = true
      }
    }
    write_number(memory, index_root, index)
    if (!found) frame.pc = bytecode_offset(end_target)
  },
  LOAD_NEW_TARGET(
    memory: Memory,
    destination: Root,
    context: Context,
    frame: Frame,
  ) {
    memory.copy_value(destination, frame.new_target_root)
  },
  TO_PROPERTY_KEY(
    runtime: Runtime,
    destination: Root,
    source: Root,
    property_key: Root,
  ): Status {
    if (load_property_key(runtime, property_key, source) === THROW) return THROW
    if (kind_of(runtime.memory, property_key) === KINDS.SYMBOL)
      runtime.memory.copy_value(destination, property_key)
    else
      write_string(
        runtime.memory,
        destination,
        to_string(runtime, property_key),
      )
    return OK
  },
  CREATE_ARRAY(runtime: Runtime, destination: Root, length: number) {
    create_array(runtime, destination, length)
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
    if (!delete_property(runtime, object, property_key))
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
      get_property(runtime, destination, object, property_key) &&
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
    memory.copy_value(operand, value)
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
    return call_function(runtime, context, context.result, temporary, object, [
      value,
    ])
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
    runtime.memory.copy_value(operand, value)
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
  CREATE_OBJECT(runtime: Runtime, destination: Root) {
    create_object(runtime, destination)
  },
  CREATE_CLOSURE(
    runtime: Runtime,
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
      runtime,
      destination,
      code_id,
      function_id,
      env,
      fn.flags,
      lexical ? frame.this_root : undefined,
      lexical ? frame.new_target_root : undefined,
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
    memory.copy_value(env, temporary)
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
    memory.copy_value(env, temporary)
  },
  POP_ENV(memory: Memory, env: Root, depth: number, temporary: Root) {
    environment_at(memory, temporary, env, depth)
    memory.copy_value(env, temporary)
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
    const handler = context.top_handler()!
    const type = handler.completion_kind,
      value = handler.completion_value_root,
      end = handler.end_pc
    runtime.memory.copy_value(temporary, value)
    pop_handler(runtime, context)
    if (type === COMPLETION_KIND.NORMAL) frame.pc = end
    else complete(runtime, context, type, temporary)
    return ([CONTEXT_STATE.DONE, CONTEXT_STATE.FAILED] as number[]).includes(
      context.status,
    )
  },
  RETURN(runtime: Runtime, context: Context, value: Root): boolean {
    complete(runtime, context, COMPLETION_KIND.RETURN, value)
    return context.status === CONTEXT_STATE.DONE
  },
  AWAIT(runtime: Runtime, context: Context, destination: Root, value: Root) {
    await_value(runtime, context, destination, value)
    return true
  },
  THROW(runtime: Runtime, context: Context, value: Root): boolean {
    complete(runtime, context, COMPLETION_KIND.THROW, value)
    return context.status === CONTEXT_STATE.FAILED
  },
  JUMP(context: Context, frame: Frame, target: number) {
    frame.pc = bytecode_offset(target)
  },
  JUMP_IF_FALSY(
    runtime: Runtime,
    context: Context,
    frame: Frame,
    condition: Root,
    target: number,
  ) {
    if (!truthy(runtime, condition)) frame.pc = bytecode_offset(target)
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
    memory.copy_value(temporary, left)
    memory.copy_value(operand, right)
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
        is_nullish(memory, temporary) || is_nullish(memory, operand)
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
    runtime.memory.copy_value(operand, source)
    if (
      ["+", "-", "~"].includes(operator) &&
      is_object(runtime.memory, operand) &&
      coerce_value(runtime, operand, operand, "ToNumber") === THROW
    )
      return THROW
    return unary_operation(runtime, destination, operand, operator)
  },
  LOAD_THIS(memory: Memory, destination: Root, context: Context, frame: Frame) {
    memory.copy_value(destination, frame.this_root)
  },
}

export function run_interpreter(runtime: Runtime, context: Context) {
  const { memory } = runtime
  // Widened so TS doesn't keep the narrowed status across calls that change it.
  context.status = CONTEXT_STATE.RUNNING as ContextStatus
  if (context.module) context.module.status = MODULE_STATE.EVALUATING
  const temporary = memory.alloc_root(),
    operand = memory.alloc_root(),
    property_key = memory.alloc_root()
  try {
    if (context.take_await_rejection()) {
      complete(runtime, context, COMPLETION_KIND.THROW, context.error)
      if (context.status === CONTEXT_STATE.FAILED) return
    }
    // run_task preserves run-to-completion across these bounded slices.
    for (let slice = 0; slice < 10000; slice++) {
      const steps = ++context.steps
      const task_steps = ++runtime.scheduler.task_steps
      if (steps > runtime.max_steps || task_steps > runtime.max_steps)
        panic("VM instruction limit exceeded")
      const frame = context.frame
      if (frame === null) panic("No active frame")
      const code_id = frame.code_id
      const function_id = frame.function_id
      const code = runtime.loader.code[code_id]
      const pc = frame.pc
      const { opcode, a, b, c, d, e } = decode_instruction(
        code.bytecodes[function_id],
        pc,
      )
      frame.advance_pc(INSTRUCTION_BYTES)
      const reg = (index: number) => frame.register(register_index(index))
      const env = frame.environment_root
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
          op.CREATE_ARRAY(runtime, reg(a), b)
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
          op.CREATE_OBJECT(runtime, reg(a))
          break
        case OP.CREATE_CLOSURE:
          op.CREATE_CLOSURE(
            runtime,
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
          op.JUMP_IF_FALSY(runtime, context, frame, reg(a), b)
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
        if (context.status === CONTEXT_STATE.FAILED) return
      }
      // The helper root must not retain environments after the instruction.
      write_undefined(memory, temporary)
      write_undefined(memory, operand)
      write_undefined(memory, property_key)
    }
    context.status = CONTEXT_STATE.READY
  } finally {
    memory.free_root(temporary)
    memory.free_root(operand)
    memory.free_root(property_key)
  }
}

export function run_task(runtime: Runtime, context: Context) {
  while (
    context.status === CONTEXT_STATE.READY ||
    context.status === CONTEXT_STATE.RUNNING
  )
    run_interpreter(runtime, context)
  if (
    context.settle &&
    (context.status === CONTEXT_STATE.DONE ||
      context.status === CONTEXT_STATE.FAILED)
  )
    settle_async_function(runtime, context)
}

export async function evaluate_context(runtime: Runtime, context: Context) {
  // Include all callbacks and await helpers in this module evaluation's budget.
  runtime.scheduler.task_steps = 0
  run_task(runtime, context)
  while (true) {
    drain_completions(runtime)
    drain_jobs(runtime)
    if (context.status === CONTEXT_STATE.READY) run_task(runtime, context)
    if (context.status === CONTEXT_STATE.FAILED)
      throw new Error(to_string(runtime, context.error))
    if (
      runtime.scheduler.has_jobs() ||
      runtime.scheduler.completions.length !== 0
    )
      continue
    if (runtime.scheduler.pending_operations !== 0) {
      await wait_for_completion(runtime)
      continue
    }
    if (context.status === CONTEXT_STATE.DONE) return
    const error: HostError = new Error("Top-level await did not settle")
    error.exit_code = 13
    throw error
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
  const completion_value_root = runtime.memory.alloc_root()
  const environment_root = runtime.memory.alloc_root()
  runtime.memory.copy_value(environment_root, frame.environment_root)
  context.handlers.push(
    new Handler({
      frame,
      start_pc,
      catch_pc,
      finally_pc,
      end_pc,
      exception_register,
      completion_value_root,
      environment_root,
    }),
  )
}

export function pop_handler(runtime: Runtime, context: Context) {
  const handler = context.top_handler()!
  runtime.memory.free_root(handler.completion_value_root)
  runtime.memory.free_root(handler.environment_root)
  context.handlers.pop()
}

// Catch and finally blocks run in the environment of their try statement.
function restore_handler_environment(
  runtime: Runtime,
  context: Context,
  frame: Frame,
  handler: Handler,
) {
  runtime.memory.copy_value(frame.environment_root, handler.environment_root)
}

function leave_handler(runtime: Runtime, context: Context) {
  const handler = context.top_handler()!
  const frame = handler.frame
  const finally_pc = handler.finally_pc
  if (finally_pc !== null) {
    handler.save_completion(COMPLETION_KIND.NORMAL)
    frame.pc = finally_pc
  } else {
    const end = handler.end_pc
    pop_handler(runtime, context)
    frame.pc = end
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
  const value = memory.alloc_root()
  memory.copy_value(value, source)
  try {
    while (true) {
      const frame = context.frame
      const handler = context.top_handler()
      if (frame !== null && handler !== null && handler.frame === frame) {
        if (type === COMPLETION_KIND.JUMP) {
          const target = read_number(memory, value)
          if (target >= handler.start_pc && target < handler.end_pc) {
            frame.pc = bytecode_offset(target)
            return
          }
          restore_handler_environment(runtime, context, frame, handler)
        }
        const phase = handler.phase
        const catch_pc = handler.catch_pc
        if (
          type === COMPLETION_KIND.THROW &&
          phase === HANDLER_PHASE.TRY &&
          catch_pc !== null
        ) {
          handler.enter_catch()
          restore_handler_environment(runtime, context, frame, handler)
          memory.copy_value(frame.register(handler.exception_register), value)
          frame.pc = catch_pc
          return
        }
        const finally_pc = handler.finally_pc
        if (phase !== HANDLER_PHASE.FINALLY && finally_pc !== null) {
          handler.save_completion(type)
          restore_handler_environment(runtime, context, frame, handler)
          memory.copy_value(handler.completion_value_root, value)
          frame.pc = finally_pc
          return
        }
        pop_handler(runtime, context)
        continue
      }
      if (type === COMPLETION_KIND.JUMP) {
        frame!.pc = bytecode_offset(read_number(memory, value))
        return
      }
      if (frame === null) {
        memory.copy_value(context.error, value)
        context.status = CONTEXT_STATE.FAILED
        return
      }
      const caller = frame.caller
      if (type === COMPLETION_KIND.RETURN) {
        if (frame.is_construct_call && !is_object(memory, value))
          memory.copy_value(value, frame.this_root)
        const destination =
          caller === null ? context.result : frame.return_root!
        memory.copy_value(destination, value)
        pop_frame(runtime, context)
        if (caller === null) context.status = CONTEXT_STATE.DONE
        return
      }
      pop_frame(runtime, context)
    }
  } finally {
    memory.free_root(value)
  }
}
