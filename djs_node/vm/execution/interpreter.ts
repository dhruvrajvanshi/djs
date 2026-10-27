import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { Handle } from "../storage/heap.ts"
import {
  VALUE_TAGS,
  is_nullish,
  heap_type_of,
  read_number,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { HEAP_TYPES, PROPERTY_FLAGS } from "../storage/layout.ts"
import type { FunctionId } from "../../compiler/compile.ts"
import { PROPERTY_KIND } from "../../compiler/compile.ts"
import type { Opcode } from "../../compiler/bytecode.ts"
import {
  OP,
  FUNCTION_ENVIRONMENT,
  INSTRUCTION_BYTES,
  NO_HOLES,
  decode_instruction,
  register_index,
  bytecode_offset,
} from "../../compiler/bytecode.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import type { CodeId, LinkedCode } from "../../runtime/modules.ts"
import { write_string } from "../heap_types/string.ts"
import { load_symbol_description } from "../heap_types/symbol.ts"
import { is_object, set_prototype } from "../heap_types/object.ts"
import { set_builtin_steps } from "../heap_types/function.ts"
import {
  copy_environment_bindings,
  create_environment,
  environment_at,
  environment_scope_id,
} from "../heap_types/environment.ts"
import {
  create_array,
  create_function,
  create_object,
} from "../semantics/objects.ts"
import {
  define_property,
  define_value_property,
  delete_property,
  get_property_value,
  has_properties,
  has_property,
  private_property,
  property_key,
  set_property_value,
  to_property_key,
} from "../semantics/properties.ts"
import type { PropertyKey } from "../semantics/properties.ts"
import {
  instance_of,
  loose_equals,
  numeric_unary_operation,
  primitive_operation,
  strict_equals,
  to_string,
  truthy,
  type_of,
} from "../semantics/operations.ts"
import {
  initialize_binding,
  load_binding,
  store_binding,
} from "../semantics/bindings.ts"
import { init_slot } from "../semantics/internal_slots.ts"
import { OK, THROW, throw_error, clear_exception } from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"
import { FIBER_STATE } from "./fiber.ts"
import type { Fiber, FiberStatus, Frame } from "./fiber.ts"
import {
  await_value,
  call,
  call_function,
  pop_frame,
  settle_fiber,
  coerce_value,
  construct_function,
} from "./calls.ts"

const { WRITABLE, ENUMERABLE, CONFIGURABLE, ACCESSOR } = PROPERTY_FLAGS

function check_properties(runtime: Runtime, value: Handle): Status {
  if (!has_properties(runtime, value))
    return throw_error(runtime, "TypeError", "Expected an object")
  return OK
}

function get_value(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: PropertyKey,
): Status {
  if (check_properties(runtime, object) === THROW) return THROW
  return get_property_value(runtime, destination, object, key)
}

function close_iterator(runtime: Runtime, iterator: Handle): Status {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const method = heap.handles.local(),
      result = heap.handles.local()
    if (get_value(runtime, method, iterator, "return") === THROW) return THROW
    if (is_nullish(heap, method)) return OK
    if (call(runtime, result, method, iterator, []) === THROW) return THROW
    if (!is_object(heap, result))
      return throw_error(
        runtime,
        "TypeError",
        "Iterator result is not an object",
      )
    return OK
  })
}

/** Calls `body` with `fixed` followed by the values `iterable` yields. */
function with_spread_arguments(
  runtime: Runtime,
  fixed: Handle[],
  iterable: Handle,
  body: (arguments_: Handle[]) => Status,
): Status {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const iterator = heap.handles.local(),
      next = heap.handles.local(),
      result = heap.handles.local(),
      done = heap.handles.local()
    const values: Handle[] = []
    if (op.GET_ITERATOR(runtime, iterator, next, iterable, result) === THROW)
      return THROW
    while (true) {
      if (call(runtime, result, next, iterator, []) === THROW) return THROW
      if (!is_object(heap, result))
        return throw_error(
          runtime,
          "TypeError",
          "Iterator result is not an object",
        )
      if (get_value(runtime, done, result, "done") === THROW) return THROW
      if (truthy(runtime, done)) break
      const value = heap.handles.local()
      values.push(value)
      if (get_value(runtime, value, result, "value") === THROW) return THROW
    }
    return body([...fixed, ...values])
  })
}

function create_block_environment(
  heap: Heap,
  destination: Handle,
  parent: Handle,
  code: LinkedCode,
  function_id: FunctionId,
  block: number,
) {
  create_environment(
    heap,
    destination,
    parent,
    code.unit.functions[function_id].block_binding_flags[block].length,
    code.block_scope_ids[function_id][block],
  )
}

/** Copies the operands, converting objects with ToPrimitive. */
function to_primitives(
  runtime: Runtime,
  left_destination: Handle,
  right_destination: Handle,
  left: Handle,
  right: Handle,
  hint?: string,
): Status {
  const { heap } = runtime
  heap.copy_value(left_destination, left)
  heap.copy_value(right_destination, right)
  for (const value of [left_destination, right_destination])
    if (
      is_object(heap, value) &&
      coerce_value(runtime, value, value, "ToPrimitive", hint) === THROW
    )
      return THROW
  return OK
}

function accessor_prefix(kind: number) {
  return kind === PROPERTY_KIND.GETTER
    ? "get"
    : kind === PROPERTY_KIND.SETTER
      ? "set"
      : ""
}

// Defines a literal's or a class's member: a value with the given attribute
// flags, or a configurable accessor.
function define_member(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  kind: number,
  flags: number,
) {
  const name = property_key(runtime, key)
  if (kind === PROPERTY_KIND.VALUE)
    define_property(runtime, object, name, value, flags)
  else
    define_property(
      runtime,
      object,
      name,
      value,
      (flags & (ENUMERABLE | CONFIGURABLE)) | ACCESSOR,
      kind === PROPERTY_KIND.SETTER ? value : undefined,
    )
}

// SetFunctionName (ECMA-262 10.2.9).
function set_function_name(
  runtime: Runtime,
  target: Handle,
  key: Handle,
  prefix: string,
) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const name = heap.handles.local(),
      description = heap.handles.local()
    let text
    if (heap_type_of(heap, key) === HEAP_TYPES.SYMBOL) {
      load_symbol_description(heap, description, key)
      text =
        tag_of(heap, description) === VALUE_TAGS.UNDEFINED
          ? ""
          : `[${to_string(runtime, description)}]`
    } else text = to_string(runtime, key)
    write_string(heap, name, prefix ? `${prefix} ${text}` : text)
    define_property(runtime, target, "name", name, CONFIGURABLE)
  })
}

function create_closure(
  runtime: Runtime,
  frame: Frame,
  destination: Handle,
  code: LinkedCode,
  code_id: CodeId,
  function_id: FunctionId,
  env: Handle,
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
    lexical ? frame.this_value : undefined,
    lexical ? frame.new_target : undefined,
    fn,
  )
}

const op = {
  LOAD_CONST(heap: Heap, destination: Handle, constant: Handle) {
    heap.copy_value(destination, constant)
  },
  MOVE(heap: Heap, destination: Handle, source: Handle) {
    heap.copy_value(destination, source)
  },
  LOAD_BINDING(
    runtime: Runtime,
    destination: Handle,
    env: Handle,
    depth: number,
    slot: number,
    temporary: Handle,
  ): Status {
    environment_at(runtime.heap, temporary, env, depth)
    return load_binding(runtime, destination, temporary, slot)
  },
  INIT_BINDING(
    runtime: Runtime,
    env: Handle,
    depth: number,
    slot: number,
    value: Handle,
    temporary: Handle,
  ) {
    environment_at(runtime.heap, temporary, env, depth)
    initialize_binding(runtime, temporary, slot, value)
  },
  STORE_BINDING(
    runtime: Runtime,
    env: Handle,
    depth: number,
    slot: number,
    value: Handle,
    temporary: Handle,
  ): Status {
    environment_at(runtime.heap, temporary, env, depth)
    return store_binding(runtime, temporary, slot, value)
  },
  LOAD_GLOBAL(
    runtime: Runtime,
    destination: Handle,
    name: string,
    allow_unresolved: boolean,
  ): Status {
    const global = runtime.realm.globals.get(name)
    if (global === undefined) {
      if (allow_unresolved)
        write_undefined(runtime.heap, destination) // typeof unresolvable name
      else
        return throw_error(runtime, "ReferenceError", `${name} is not defined`)
    } else runtime.heap.copy_value(destination, global)
    return OK
  },
  // Iteration ops call guest methods synchronously, like coercions.
  GET_ITERATOR(
    runtime: Runtime,
    iterator: Handle,
    next: Handle,
    iterable: Handle,
    temporary: Handle,
  ): Status {
    const { heap } = runtime
    if (is_nullish(heap, iterable))
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
    if (is_nullish(heap, temporary))
      return throw_error(runtime, "TypeError", "Value is not iterable")
    if (call(runtime, iterator, temporary, iterable, []) === THROW) return THROW
    if (!is_object(heap, iterator))
      return throw_error(
        runtime,
        "TypeError",
        "Result of Symbol.iterator is not an object",
      )
    return get_value(runtime, next, iterator, "next")
  },
  ITERATOR_NEXT(
    runtime: Runtime,
    fiber: Fiber,
    frame: Frame,
    destination: Handle,
    iterator: Handle,
    next: Handle,
    done_target: number,
    temporary: Handle,
    operand: Handle,
  ): Status {
    const { heap } = runtime
    if (call(runtime, temporary, next, iterator, []) === THROW) return THROW
    if (!is_object(heap, temporary))
      return throw_error(
        runtime,
        "TypeError",
        "Iterator result is not an object",
      )
    if (get_value(runtime, operand, temporary, "done") === THROW) return THROW
    if (truthy(runtime, operand)) {
      frame.pc = bytecode_offset(done_target)
      return OK
    }
    return get_value(runtime, destination, temporary, "value")
  },
  ITERATOR_CLOSE(
    runtime: Runtime,
    iterator: Handle,
    throwing: boolean,
  ): Status {
    const status = close_iterator(runtime, iterator)
    if (!throwing) return status
    // The pending throw wins over errors from closing.
    if (status === THROW) clear_exception(runtime)
    return OK
  },
  CREATE_REGEXP(
    runtime: Runtime,
    destination: Handle,
    pattern: Handle,
    flags: Handle,
  ): Status {
    const create = runtime.realm.intrinsics.get("RegExpCreate")
    if (create === undefined) panic("RegExp is not initialized")
    return call(runtime, destination, create, undefined, [pattern, flags])
  },
  COPY_DATA_PROPERTIES(
    runtime: Runtime,
    object: Handle,
    source: Handle,
    temporary: Handle,
  ): Status {
    const copy = runtime.realm.intrinsics.get("CopyDataProperties")
    if (copy === undefined) panic("CopyDataProperties is not initialized")
    return call(runtime, temporary, copy, undefined, [object, source])
  },
  GET_FOR_IN_ITERATOR(
    runtime: Runtime,
    iterator: Handle,
    next: Handle,
    source: Handle,
  ): Status {
    const enumerate = runtime.realm.intrinsics.get("EnumerateObjectProperties")
    if (enumerate === undefined) panic("for-in is not initialized")
    if (call(runtime, iterator, enumerate, undefined, [source]) === THROW)
      return THROW
    return get_value(runtime, next, iterator, "next")
  },
  LOAD_NEW_TARGET(heap: Heap, destination: Handle, fiber: Fiber, frame: Frame) {
    heap.copy_value(destination, frame.new_target)
  },
  TO_PROPERTY_KEY(
    runtime: Runtime,
    destination: Handle,
    source: Handle,
  ): Status {
    const key = to_property_key(runtime, source)
    if (key === undefined) return THROW
    if (typeof key === "string") write_string(runtime.heap, destination, key)
    else runtime.heap.copy_value(destination, key)
    return OK
  },
  CREATE_ARRAY(
    runtime: Runtime,
    destination: Handle,
    elements: (index: number) => Handle,
    length: number,
    holes: readonly number[],
  ) {
    create_array(runtime, destination, length)
    for (let index = 0; index < length; index++) {
      if (holes.includes(index)) continue
      define_property(runtime, destination, String(index), elements(index))
    }
  },
  DELETE_PROP(
    runtime: Runtime,
    destination: Handle,
    object: Handle,
    key: Handle,
  ): Status {
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    if (check_properties(runtime, object) === THROW) return THROW
    if (!delete_property(runtime, object, name))
      return throw_error(
        runtime,
        "TypeError",
        "Cannot delete non-configurable property",
      )
    write_boolean(runtime.heap, destination, true)
    return OK
  },
  GET_PROP(
    runtime: Runtime,
    destination: Handle,
    object: Handle,
    key: Handle,
  ): Status {
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    return get_value(runtime, destination, object, name)
  },
  SET_PROP(
    runtime: Runtime,
    object: Handle,
    key: Handle,
    value: Handle,
    operand: Handle,
  ): Status {
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    if (check_properties(runtime, object) === THROW) return THROW
    runtime.heap.copy_value(operand, value)
    return set_property_value(runtime, object, name, operand)
  },
  DEFINE_PROP(
    runtime: Runtime,
    object: Handle,
    key: Handle,
    value: Handle,
    flags: number,
    setter: Handle | undefined,
    operand: Handle,
  ): Status {
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    runtime.heap.copy_value(operand, value)
    return define_value_property(runtime, object, name, operand, flags, setter)
  },
  SET_PROTO(heap: Heap, object: Handle, prototype: Handle) {
    set_prototype(heap, object, prototype)
  },
  SET_PRIVATE(
    runtime: Runtime,
    object: Handle,
    key: Handle,
    value: Handle,
    initialize: boolean,
    readonly: boolean,
    temporary: Handle,
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
    destination: Handle,
    object: Handle,
    key: Handle,
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
  INIT_SLOT(
    runtime: Runtime,
    object: Handle,
    name: string,
    value: Handle,
  ): Status {
    return init_slot(runtime, object, name, value)
  },
  SET_BEHAVIOR(
    heap: Heap,
    object: Handle,
    steps: Handle,
    constructor: boolean,
  ) {
    set_builtin_steps(heap, object, steps, constructor)
  },
  CREATE_OBJECT(
    runtime: Runtime,
    destination: Handle,
    code: LinkedCode,
    template: number,
    operands: (index: number) => Handle,
  ) {
    create_object(runtime, destination)
    let next = 0
    for (const { key, kind } of code.unit.object_templates[template].entries) {
      const name = key === null ? operands(next++) : code.constants[key]
      define_member(
        runtime,
        destination,
        name,
        operands(next++),
        kind,
        WRITABLE | ENUMERABLE | CONFIGURABLE,
      )
    }
  },
  CREATE_CLASS(
    runtime: Runtime,
    frame: Frame,
    destination: Handle,
    code: LinkedCode,
    code_id: CodeId,
    class_id: number,
    keys: (index: number) => Handle,
    env: Handle,
    temporary: Handle,
    operand: Handle,
  ) {
    const { heap } = runtime
    const descriptor = code.unit.classes[class_id]
    create_closure(
      runtime,
      frame,
      destination,
      code,
      code_id,
      descriptor.constructor_function,
      env,
    )
    create_object(runtime, temporary)
    heap.handles.scope(() => {
      define_property(runtime, destination, "prototype", temporary, 0)
      define_property(
        runtime,
        temporary,
        "constructor",
        destination,
        WRITABLE | CONFIGURABLE,
      )
      let next = 0
      for (const member of descriptor.members) {
        create_closure(
          runtime,
          frame,
          operand,
          code,
          code_id,
          member.function,
          env,
        )
        let name
        if (member.key === null) {
          name = keys(next++)
          set_function_name(
            runtime,
            operand,
            name,
            accessor_prefix(member.kind),
          )
        } else name = code.constants[member.key]
        const home = member.is_static ? destination : temporary
        define_member(
          runtime,
          home,
          name,
          operand,
          member.kind,
          WRITABLE | CONFIGURABLE,
        )
      }
    })
  },
  SET_FUNCTION_NAME(
    runtime: Runtime,
    target: Handle,
    key: Handle,
    prefix: string,
  ) {
    set_function_name(runtime, target, key, prefix)
  },
  CREATE_CLOSURE(
    runtime: Runtime,
    frame: Frame,
    destination: Handle,
    code: LinkedCode,
    code_id: CodeId,
    function_id: FunctionId,
    env: Handle,
  ) {
    create_closure(runtime, frame, destination, code, code_id, function_id, env)
  },
  CALL(
    runtime: Runtime,
    fiber: Fiber,
    destination: Handle,
    callee: Handle,
    receiver: Handle,
    arguments_: Handle[],
  ): Status {
    return call_function(
      runtime,
      fiber,
      destination,
      callee,
      receiver,
      arguments_,
    )
  },
  CONSTRUCT(
    runtime: Runtime,
    fiber: Fiber,
    destination: Handle,
    callee: Handle,
    new_target: Handle,
    arguments_: Handle[],
  ): Status {
    return construct_function(
      runtime,
      fiber,
      destination,
      callee,
      arguments_,
      tag_of(runtime.heap, new_target) === VALUE_TAGS.UNDEFINED
        ? callee
        : new_target,
    )
  },
  BIND_THIS(runtime: Runtime, frame: Frame, value: Handle): Status {
    if (tag_of(runtime.heap, frame.this_value) !== VALUE_TAGS.UNINITIALIZED)
      return throw_error(
        runtime,
        "ReferenceError",
        "Super constructor may only be called once",
      )
    runtime.heap.copy_value(frame.this_value, value)
    return OK
  },
  PUSH_ENV(
    heap: Heap,
    env: Handle,
    code: LinkedCode,
    function_id: FunctionId,
    block: number,
    temporary: Handle,
  ) {
    create_block_environment(heap, temporary, env, code, function_id, block)
    heap.copy_value(env, temporary)
  },
  // Replaces the current environment with a sibling holding the same values,
  // giving each loop iteration fresh bindings.
  COPY_ENV(
    heap: Heap,
    env: Handle,
    code: LinkedCode,
    function_id: FunctionId,
    block: number,
    temporary: Handle,
    operand: Handle,
  ) {
    environment_at(heap, operand, env, 1)
    create_block_environment(heap, temporary, operand, code, function_id, block)
    copy_environment_bindings(heap, temporary, env)
    heap.copy_value(env, temporary)
  },
  POP_ENV(heap: Heap, env: Handle, depth: number, temporary: Handle) {
    environment_at(heap, temporary, env, depth)
    heap.copy_value(env, temporary)
  },
  // The handlers below return true when run_interpreter must stop.
  RETURN(runtime: Runtime, fiber: Fiber, value: Handle): boolean {
    return_value(runtime, fiber, value)
    return fiber.status === FIBER_STATE.DONE
  },
  AWAIT(runtime: Runtime, fiber: Fiber, destination: Handle, value: Handle) {
    await_value(runtime, fiber, destination, value)
    return true
  },
  THROW(runtime: Runtime, fiber: Fiber, value: Handle): boolean {
    throw_value(runtime, fiber, value)
    return fiber.status === FIBER_STATE.FAILED
  },
  THROW_ERROR(runtime: Runtime, type: string, message: string): Status {
    return throw_error(runtime, type, message)
  },
  JUMP(frame: Frame, target: number) {
    frame.pc = bytecode_offset(target)
  },
  JUMP_IF(frame: Frame, condition: boolean, target: number) {
    if (condition) frame.pc = bytecode_offset(target)
  },
  JUMP_AND_LINK(heap: Heap, frame: Frame, link: Handle, target: number) {
    write_number(heap, link, frame.pc)
    frame.pc = bytecode_offset(target)
  },
  JUMP_INDIRECT(heap: Heap, frame: Frame, link: Handle) {
    frame.pc = bytecode_offset(read_number(heap, link))
  },
  // `+` converts objects with no hint; the other operators prefer numbers.
  PRIMITIVE_OPERATOR(
    runtime: Runtime,
    opcode: Opcode,
    destination: Handle,
    left: Handle,
    right: Handle,
    temporary: Handle,
    operand: Handle,
  ): Status {
    const hint = opcode === OP.ADD ? undefined : "number"
    if (to_primitives(runtime, temporary, operand, left, right, hint) === THROW)
      return THROW
    return primitive_operation(runtime, destination, temporary, operand, opcode)
  },
  EQUALITY(
    runtime: Runtime,
    opcode: Opcode,
    destination: Handle,
    left: Handle,
    right: Handle,
    temporary: Handle,
    operand: Handle,
  ): Status {
    const { heap } = runtime
    let equal
    if (opcode === OP.STRICT_EQ || opcode === OP.STRICT_NOT_EQ)
      equal = strict_equals(runtime, left, right)
    else {
      heap.copy_value(temporary, left)
      heap.copy_value(operand, right)
      // == converts an object only when compared with a primitive.
      if (
        is_object(heap, left) !== is_object(heap, right) &&
        !is_nullish(heap, left) &&
        !is_nullish(heap, right) &&
        to_primitives(runtime, temporary, operand, left, right) === THROW
      )
        return THROW
      equal = loose_equals(runtime, temporary, operand)
    }
    write_boolean(
      heap,
      destination,
      equal === (opcode === OP.EQ || opcode === OP.STRICT_EQ),
    )
    return OK
  },
  IN(
    runtime: Runtime,
    destination: Handle,
    left: Handle,
    right: Handle,
  ): Status {
    const { heap } = runtime
    if (!is_object(heap, right))
      return throw_error(
        runtime,
        "TypeError",
        "Right operand of in must be an object",
      )
    const key = to_property_key(runtime, left)
    if (key === undefined) return THROW
    write_boolean(heap, destination, has_property(runtime, right, key))
    return OK
  },
  NUMERIC_UNARY(
    runtime: Runtime,
    opcode: Opcode,
    destination: Handle,
    source: Handle,
    operand: Handle,
  ): Status {
    runtime.heap.copy_value(operand, source)
    if (
      is_object(runtime.heap, operand) &&
      coerce_value(runtime, operand, operand, "ToNumber") === THROW
    )
      return THROW
    return numeric_unary_operation(runtime, destination, operand, opcode)
  },
  TO_STRING(runtime: Runtime, destination: Handle, source: Handle): Status {
    const { heap } = runtime
    if (heap_type_of(heap, source) === HEAP_TYPES.SYMBOL)
      return throw_error(
        runtime,
        "TypeError",
        "Cannot convert a Symbol value to a string",
      )
    if (is_object(heap, source))
      return coerce_value(runtime, destination, source, "ToString")
    write_string(heap, destination, to_string(runtime, source))
    return OK
  },
  LOAD_THIS(runtime: Runtime, destination: Handle, frame: Frame): Status {
    if (tag_of(runtime.heap, frame.this_value) === VALUE_TAGS.UNINITIALIZED)
      return throw_error(runtime, "ReferenceError", UNBOUND_THIS_MESSAGE)
    runtime.heap.copy_value(destination, frame.this_value)
    return OK
  },
}

const UNBOUND_THIS_MESSAGE =
  "Must call super constructor in derived class before accessing 'this'"

export function run_interpreter(runtime: Runtime, fiber: Fiber) {
  const { heap } = runtime
  // Widened so TS doesn't keep the narrowed status across calls that change it.
  fiber.status = FIBER_STATE.RUNNING as FiberStatus
  heap.handles.scope(() => {
    const temporary = heap.handles.local(),
      operand = heap.handles.local()
    if (fiber.take_await_rejection()) {
      throw_value(runtime, fiber, fiber.error)
      if (fiber.status === FIBER_STATE.FAILED) return
    }
    // run_task preserves run-to-completion across these bounded slices.
    for (let slice = 0; slice < 10000; slice++) {
      const frame = fiber.frame
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
      const env = frame.environment
      let status: Status = OK
      switch (opcode) {
        case OP.LOAD_CONST:
          op.LOAD_CONST(heap, reg(a), code.constants[b])
          break
        case OP.MOVE:
          op.MOVE(heap, reg(a), reg(b))
          break
        case OP.LOAD_THIS:
          status = op.LOAD_THIS(runtime, reg(a), frame)
          break
        case OP.BIND_THIS:
          status = op.BIND_THIS(runtime, frame, reg(a))
          break
        case OP.LOAD_NEW_TARGET:
          op.LOAD_NEW_TARGET(heap, reg(a), fiber, frame)
          break
        case OP.LOAD_GLOBAL:
          status = op.LOAD_GLOBAL(
            runtime,
            reg(a),
            code.unit.literals[b] as string,
            c === 1,
          )
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
        case OP.PUSH_ENV:
          op.PUSH_ENV(heap, env, code, function_id, a, temporary)
          break
        case OP.POP_ENV:
          op.POP_ENV(heap, env, a, temporary)
          break
        case OP.COPY_ENV:
          op.COPY_ENV(heap, env, code, function_id, a, temporary, operand)
          break
        case OP.CREATE_OBJECT:
          op.CREATE_OBJECT(runtime, reg(a), code, b, (index) => reg(c + index))
          break
        case OP.CREATE_ARRAY:
          op.CREATE_ARRAY(
            runtime,
            reg(a),
            (index) => reg(b + index),
            c,
            d === NO_HOLES ? [] : code.unit.array_holes[d],
          )
          break
        case OP.CREATE_CLOSURE:
          op.CREATE_CLOSURE(
            runtime,
            frame,
            reg(a),
            code,
            code_id,
            b as FunctionId,
            env,
          )
          break
        case OP.CREATE_CLASS:
          op.CREATE_CLASS(
            runtime,
            frame,
            reg(a),
            code,
            code_id,
            b,
            (index) => reg(c + index),
            env,
            temporary,
            operand,
          )
          break
        case OP.SET_FUNCTION_NAME:
          op.SET_FUNCTION_NAME(
            runtime,
            reg(a),
            reg(b),
            code.unit.literals[c] as string,
          )
          break
        case OP.GET_PROP:
          status = op.GET_PROP(runtime, reg(a), reg(b), reg(c))
          break
        case OP.SET_PROP:
          status = op.SET_PROP(runtime, reg(a), reg(b), reg(c), operand)
          break
        case OP.DEFINE_PROP:
          status = op.DEFINE_PROP(
            runtime,
            reg(a),
            reg(b),
            reg(c),
            d,
            e === 1 ? reg(c) : undefined,
            operand,
          )
          break
        case OP.DELETE_PROP:
          status = op.DELETE_PROP(runtime, reg(a), reg(b), reg(c))
          break
        case OP.SET_PROTO:
          op.SET_PROTO(heap, reg(a), reg(b))
          break
        case OP.TO_PROPERTY_KEY:
          status = op.TO_PROPERTY_KEY(runtime, reg(a), reg(b))
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
        case OP.INIT_SLOT:
          status = op.INIT_SLOT(
            runtime,
            reg(a),
            code.unit.literals[b] as string,
            reg(c),
          )
          break
        case OP.SET_BEHAVIOR:
          op.SET_BEHAVIOR(heap, reg(a), reg(b), c === 1)
          break
        case OP.CALL:
          status = op.CALL(
            runtime,
            fiber,
            reg(a),
            reg(b),
            reg(c),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.CONSTRUCT:
          status = op.CONSTRUCT(
            runtime,
            fiber,
            reg(a),
            reg(b),
            reg(c),
            Array.from({ length: e }, (_, index) => reg(d + index)),
          )
          break
        case OP.CALL_SPREAD:
          status = with_spread_arguments(
            runtime,
            Array.from({ length: e }, (_, index) => reg(d + index)),
            reg(d + e),
            (arguments_) =>
              op.CALL(runtime, fiber, reg(a), reg(b), reg(c), arguments_),
          )
          break
        case OP.CONSTRUCT_SPREAD:
          status = with_spread_arguments(
            runtime,
            Array.from({ length: e }, (_, index) => reg(d + index)),
            reg(d + e),
            (arguments_) =>
              op.CONSTRUCT(runtime, fiber, reg(a), reg(b), reg(c), arguments_),
          )
          break
        case OP.RETURN:
          if (
            frame.is_construct_call &&
            tag_of(heap, frame.this_value) === VALUE_TAGS.UNINITIALIZED &&
            !is_object(heap, reg(a))
          ) {
            status = throw_error(
              runtime,
              "ReferenceError",
              UNBOUND_THIS_MESSAGE,
            )
            break
          }
          if (op.RETURN(runtime, fiber, reg(a))) return
          break
        case OP.AWAIT:
          if (op.AWAIT(runtime, fiber, reg(a), reg(b))) return
          break
        case OP.THROW:
          if (op.THROW(runtime, fiber, reg(a))) return
          break
        case OP.THROW_ERROR:
          status = op.THROW_ERROR(
            runtime,
            code.unit.literals[a] as string,
            code.unit.literals[b] as string,
          )
          break
        case OP.JUMP:
          op.JUMP(frame, a)
          break
        case OP.JUMP_IF_FALSY:
          op.JUMP_IF(frame, !truthy(runtime, reg(a)), b)
          break
        case OP.JUMP_IF_TRUTHY:
          op.JUMP_IF(frame, truthy(runtime, reg(a)), b)
          break
        case OP.JUMP_IF_NOT_NULLISH:
          op.JUMP_IF(frame, !is_nullish(heap, reg(a)), b)
          break
        case OP.JUMP_IF_NOT_UNDEFINED:
          op.JUMP_IF(frame, tag_of(heap, reg(a)) !== VALUE_TAGS.UNDEFINED, b)
          break
        case OP.JUMP_AND_LINK:
          op.JUMP_AND_LINK(heap, frame, reg(a), b)
          break
        case OP.JUMP_INDIRECT:
          op.JUMP_INDIRECT(heap, frame, reg(a))
          break
        case OP.GET_ITERATOR:
          status = op.GET_ITERATOR(runtime, reg(a), reg(b), reg(c), temporary)
          break
        case OP.COPY_DATA_PROPERTIES:
          status = op.COPY_DATA_PROPERTIES(runtime, reg(a), reg(b), temporary)
          break
        case OP.CREATE_REGEXP:
          status = op.CREATE_REGEXP(runtime, reg(a), reg(b), reg(c))
          break
        case OP.GET_FOR_IN_ITERATOR:
          status = op.GET_FOR_IN_ITERATOR(runtime, reg(a), reg(b), reg(c))
          break
        case OP.ITERATOR_NEXT:
          status = op.ITERATOR_NEXT(
            runtime,
            fiber,
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
        case OP.ADD:
        case OP.SUB:
        case OP.MUL:
        case OP.DIV:
        case OP.MOD:
        case OP.EXP:
        case OP.BIT_AND:
        case OP.BIT_OR:
        case OP.BIT_XOR:
        case OP.SHL:
        case OP.SHR:
        case OP.USHR:
        case OP.LT:
        case OP.LT_EQ:
        case OP.GT:
        case OP.GT_EQ:
          status = op.PRIMITIVE_OPERATOR(
            runtime,
            opcode,
            reg(a),
            reg(b),
            reg(c),
            temporary,
            operand,
          )
          break
        case OP.EQ:
        case OP.NOT_EQ:
        case OP.STRICT_EQ:
        case OP.STRICT_NOT_EQ:
          status = op.EQUALITY(
            runtime,
            opcode,
            reg(a),
            reg(b),
            reg(c),
            temporary,
            operand,
          )
          break
        case OP.IN:
          status = op.IN(runtime, reg(a), reg(b), reg(c))
          break
        case OP.INSTANCEOF:
          status = instance_of(runtime, reg(a), reg(b), reg(c))
          break
        case OP.NOT:
          write_boolean(heap, reg(a), !truthy(runtime, reg(b)))
          break
        case OP.NEGATE:
        case OP.TO_NUMBER:
        case OP.BIT_NOT:
          status = op.NUMERIC_UNARY(runtime, opcode, reg(a), reg(b), operand)
          break
        case OP.TYPEOF:
          type_of(runtime, reg(a), reg(b))
          break
        case OP.TO_STRING:
          status = op.TO_STRING(runtime, reg(a), reg(b))
          break
        default:
          panic(`Unknown opcode: ${opcode}`)
      }
      if (status === THROW) {
        throw_value(runtime, fiber, runtime.pending_exception)
        clear_exception(runtime)
        if (fiber.status === FIBER_STATE.FAILED) return
      }
      // The helper handles must not retain environments after the instruction.
      write_undefined(heap, temporary)
      write_undefined(heap, operand)
    }
    fiber.status = FIBER_STATE.READY
  })
}

export function run_task(runtime: Runtime, fiber: Fiber) {
  runtime.running.push(fiber)
  try {
    while (
      fiber.status === FIBER_STATE.READY ||
      fiber.status === FIBER_STATE.RUNNING
    )
      run_interpreter(runtime, fiber)
  } finally {
    runtime.running.pop()
  }
  if (
    fiber.settle &&
    (fiber.status === FIBER_STATE.DONE || fiber.status === FIBER_STATE.FAILED)
  )
    settle_fiber(runtime, fiber)
}

// Restores the environment of the frame's code at the handler, which is the
// innermost instance of the handler's block (or the function environment).
function restore_environment(
  runtime: Runtime,
  frame: Frame,
  environment: number,
) {
  const code = runtime.loader.code[frame.code_id]
  const scope =
    environment === FUNCTION_ENVIRONMENT
      ? code.scope_ids[frame.function_id]
      : code.block_scope_ids[frame.function_id][environment]
  const env = frame.environment
  while (environment_scope_id(runtime.heap, env) !== scope)
    environment_at(runtime.heap, env, env, 1)
}

// Unwinds frames to the innermost exception handler covering the throwing
// instruction, which is the one before each frame's pc.
function throw_value(runtime: Runtime, fiber: Fiber, source: Handle) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const value = heap.handles.local()
    heap.copy_value(value, source)
    while (true) {
      const frame = fiber.frame
      if (frame === null) {
        heap.copy_value(fiber.error, value)
        fiber.status = FIBER_STATE.FAILED
        return
      }
      const pc = frame.pc - INSTRUCTION_BYTES
      const handler = runtime.loader.code[frame.code_id].unit.functions[
        frame.function_id
      ].handlers.find(({ start, end }) => pc >= start && pc < end)
      if (handler) {
        restore_environment(runtime, frame, handler.environment)
        heap.copy_value(frame.register(register_index(handler.register)), value)
        frame.pc = bytecode_offset(handler.target)
        return
      }
      pop_frame(runtime, fiber)
    }
  })
}

function return_value(runtime: Runtime, fiber: Fiber, source: Handle) {
  const { heap } = runtime
  const frame = fiber.frame!
  const caller = frame.caller
  heap.handles.scope(() => {
    const value = heap.handles.local()
    heap.copy_value(value, source)
    if (frame.is_construct_call && !is_object(heap, value))
      heap.copy_value(value, frame.this_value)
    heap.copy_value(caller === null ? fiber.result : frame.destination!, value)
    pop_frame(runtime, fiber)
    if (caller === null) fiber.status = FIBER_STATE.DONE
  })
}
