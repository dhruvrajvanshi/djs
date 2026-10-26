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
import { write_string } from "../records/string.ts"
import { load_symbol_description } from "../records/symbol.ts"
import { is_object, set_prototype } from "../records/object.ts"
import { set_builtin_steps } from "../records/function.ts"
import {
  copy_environment_bindings,
  create_environment,
  environment_at,
  environment_scope_id,
} from "../records/environment.ts"
import {
  create_array,
  create_function,
  create_object,
} from "../semantics/objects.ts"
import {
  define_property,
  define_value_property,
  delete_property,
  get_property,
  has_properties,
  has_property,
  private_property,
  set_property,
} from "../semantics/properties.ts"
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
import { init_slot } from "../semantics/slots.ts"
import { OK, THROW, throw_error, clear_exception } from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"
import { FIBER_STATE } from "./fiber.ts"
import type { Fiber, FiberStatus, Frame } from "./fiber.ts"
import {
  await_value,
  call_function,
  pop_frame,
  settle_fiber,
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

/** Calls `body` with `fixed` followed by the values `iterable` yields. */
function with_spread_arguments(
  runtime: Runtime,
  fixed: Root[],
  iterable: Root,
  body: (arguments_: Root[]) => Status,
): Status {
  const { memory } = runtime
  const iterator = memory.alloc_root(),
    next = memory.alloc_root(),
    result = memory.alloc_root(),
    done = memory.alloc_root()
  const values: Root[] = []
  try {
    if (op.GET_ITERATOR(runtime, iterator, next, iterable, result) === THROW)
      return THROW
    while (true) {
      if (invoke_sync(runtime, result, next, iterator, []) === THROW)
        return THROW
      if (!is_object(memory, result))
        return throw_error(
          runtime,
          "TypeError",
          "Iterator result is not an object",
        )
      const done_key = runtime.realm.property_names.get("done")!
      if (get_value(runtime, done, result, done_key) === THROW) return THROW
      if (truthy(runtime, done)) break
      const value = memory.alloc_root()
      values.push(value)
      const value_key = runtime.realm.property_names.get("value")!
      if (get_value(runtime, value, result, value_key) === THROW) return THROW
    }
    return body([...fixed, ...values])
  } finally {
    for (const root of [iterator, next, result, done, ...values])
      memory.free_root(root)
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

/** Copies the operands, converting objects with ToPrimitive. */
function to_primitives(
  runtime: Runtime,
  left_destination: Root,
  right_destination: Root,
  left: Root,
  right: Root,
  hint?: string,
): Status {
  const { memory } = runtime
  memory.copy_value(left_destination, left)
  memory.copy_value(right_destination, right)
  for (const value of [left_destination, right_destination])
    if (
      is_object(memory, value) &&
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
  object: Root,
  key: Root,
  value: Root,
  kind: number,
  flags: number,
) {
  if (kind === PROPERTY_KIND.VALUE)
    define_property(runtime, object, key, value, flags)
  else
    define_property(
      runtime,
      object,
      key,
      value,
      (flags & 6) | 16,
      kind === PROPERTY_KIND.SETTER ? value : undefined,
    )
}

// SetFunctionName (ECMA-262 10.2.9).
function set_function_name(
  runtime: Runtime,
  target: Root,
  key: Root,
  prefix: string,
) {
  const { memory } = runtime
  const name = memory.alloc_root(),
    description = memory.alloc_root()
  try {
    let text
    if (kind_of(memory, key) === KINDS.SYMBOL) {
      load_symbol_description(memory, description, key)
      text =
        tag_of(memory, description) === TAGS.UNDEFINED
          ? ""
          : `[${to_string(runtime, description)}]`
    } else text = to_string(runtime, key)
    write_string(memory, name, prefix ? `${prefix} ${text}` : text)
    write_string(memory, description, "name")
    define_property(runtime, target, description, name, 4)
  } finally {
    memory.free_root(name)
    memory.free_root(description)
  }
}

function create_closure(
  runtime: Runtime,
  frame: Frame,
  destination: Root,
  code: LinkedCode,
  code_id: CodeId,
  function_id: FunctionId,
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
    fiber: Fiber,
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
  GET_FOR_IN_ITERATOR(
    runtime: Runtime,
    iterator: Root,
    next: Root,
    source: Root,
  ): Status {
    const enumerate = runtime.realm.intrinsics.get("EnumerateObjectProperties")
    if (enumerate === undefined) panic("for-in is not initialized")
    if (
      invoke_sync(runtime, iterator, enumerate, undefined, [source]) === THROW
    )
      return THROW
    return get_value(
      runtime,
      next,
      iterator,
      runtime.realm.property_names.get("next")!,
    )
  },
  LOAD_NEW_TARGET(
    memory: Memory,
    destination: Root,
    fiber: Fiber,
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
  CREATE_ARRAY(
    runtime: Runtime,
    destination: Root,
    elements: (index: number) => Root,
    length: number,
    holes: readonly number[],
    key: Root,
  ) {
    create_array(runtime, destination, length)
    for (let index = 0; index < length; index++) {
      if (holes.includes(index)) continue
      write_string(runtime.memory, key, String(index))
      define_property(runtime, destination, key, elements(index))
    }
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
    fiber: Fiber,
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
      return call_function(runtime, fiber, destination, destination, object, [])
    return OK
  },
  SET_PROP(
    runtime: Runtime,
    fiber: Fiber,
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
    return call_function(runtime, fiber, fiber.result, temporary, object, [
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
  CREATE_OBJECT(
    runtime: Runtime,
    destination: Root,
    code: LinkedCode,
    template: number,
    operands: (index: number) => Root,
  ) {
    create_object(runtime, destination)
    let next = 0
    for (const { key, kind } of code.unit.object_templates[template].entries) {
      const name = key === null ? operands(next++) : code.constants[key]
      define_member(runtime, destination, name, operands(next++), kind, 7)
    }
  },
  CREATE_CLASS(
    runtime: Runtime,
    frame: Frame,
    destination: Root,
    code: LinkedCode,
    code_id: CodeId,
    class_id: number,
    keys: (index: number) => Root,
    env: Root,
    temporary: Root,
    operand: Root,
  ) {
    const { memory } = runtime
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
    const key = memory.alloc_root()
    try {
      write_string(memory, key, "prototype")
      define_property(runtime, destination, key, temporary, 0)
      write_string(memory, key, "constructor")
      define_property(runtime, temporary, key, destination, 5)
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
        define_member(runtime, home, name, operand, member.kind, 5)
      }
    } finally {
      memory.free_root(key)
    }
  },
  SET_FUNCTION_NAME(runtime: Runtime, target: Root, key: Root, prefix: string) {
    set_function_name(runtime, target, key, prefix)
  },
  CREATE_CLOSURE(
    runtime: Runtime,
    frame: Frame,
    destination: Root,
    code: LinkedCode,
    code_id: CodeId,
    function_id: FunctionId,
    env: Root,
  ) {
    create_closure(runtime, frame, destination, code, code_id, function_id, env)
  },
  CALL(
    runtime: Runtime,
    fiber: Fiber,
    destination: Root,
    callee: Root,
    receiver: Root,
    arguments_: Root[],
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
    destination: Root,
    callee: Root,
    arguments_: Root[],
  ): Status {
    return construct_function(runtime, fiber, destination, callee, arguments_)
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
  // The handlers below return true when run_interpreter must stop.
  RETURN(runtime: Runtime, fiber: Fiber, value: Root): boolean {
    return_value(runtime, fiber, value)
    return fiber.status === FIBER_STATE.DONE
  },
  AWAIT(runtime: Runtime, fiber: Fiber, destination: Root, value: Root) {
    await_value(runtime, fiber, destination, value)
    return true
  },
  THROW(runtime: Runtime, fiber: Fiber, value: Root): boolean {
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
  JUMP_AND_LINK(memory: Memory, frame: Frame, link: Root, target: number) {
    write_number(memory, link, frame.pc)
    frame.pc = bytecode_offset(target)
  },
  JUMP_INDIRECT(memory: Memory, frame: Frame, link: Root) {
    frame.pc = bytecode_offset(read_number(memory, link))
  },
  // `+` converts objects with no hint; the other operators prefer numbers.
  PRIMITIVE_OPERATOR(
    runtime: Runtime,
    opcode: Opcode,
    destination: Root,
    left: Root,
    right: Root,
    temporary: Root,
    operand: Root,
  ): Status {
    const hint = opcode === OP.ADD ? undefined : "number"
    if (to_primitives(runtime, temporary, operand, left, right, hint) === THROW)
      return THROW
    return primitive_operation(runtime, destination, temporary, operand, opcode)
  },
  EQUALITY(
    runtime: Runtime,
    opcode: Opcode,
    destination: Root,
    left: Root,
    right: Root,
    temporary: Root,
    operand: Root,
  ): Status {
    const { memory } = runtime
    let equal
    if (opcode === OP.STRICT_EQ || opcode === OP.STRICT_NOT_EQ)
      equal = strict_equals(runtime, left, right)
    else {
      memory.copy_value(temporary, left)
      memory.copy_value(operand, right)
      // == converts an object only when compared with a primitive.
      if (
        is_object(memory, left) !== is_object(memory, right) &&
        !is_nullish(memory, left) &&
        !is_nullish(memory, right) &&
        to_primitives(runtime, temporary, operand, left, right) === THROW
      )
        return THROW
      equal = loose_equals(runtime, temporary, operand)
    }
    write_boolean(
      memory,
      destination,
      equal === (opcode === OP.EQ || opcode === OP.STRICT_EQ),
    )
    return OK
  },
  IN(
    runtime: Runtime,
    destination: Root,
    left: Root,
    right: Root,
    temporary: Root,
  ): Status {
    const { memory } = runtime
    if (!is_object(memory, right))
      return throw_error(
        runtime,
        "TypeError",
        "Right operand of in must be an object",
      )
    memory.copy_value(temporary, left)
    if (
      is_object(memory, temporary) &&
      coerce_value(runtime, temporary, temporary, "ToString") === THROW
    )
      return THROW
    write_boolean(memory, destination, has_property(runtime, right, temporary))
    return OK
  },
  NUMERIC_UNARY(
    runtime: Runtime,
    opcode: Opcode,
    destination: Root,
    source: Root,
    operand: Root,
  ): Status {
    runtime.memory.copy_value(operand, source)
    if (
      is_object(runtime.memory, operand) &&
      coerce_value(runtime, operand, operand, "ToNumber") === THROW
    )
      return THROW
    return numeric_unary_operation(runtime, destination, operand, opcode)
  },
  TO_STRING(runtime: Runtime, destination: Root, source: Root): Status {
    const { memory } = runtime
    if (kind_of(memory, source) === KINDS.SYMBOL)
      return throw_error(
        runtime,
        "TypeError",
        "Cannot convert a Symbol value to a string",
      )
    if (is_object(memory, source))
      return coerce_value(runtime, destination, source, "ToString")
    write_string(memory, destination, to_string(runtime, source))
    return OK
  },
  LOAD_THIS(memory: Memory, destination: Root, fiber: Fiber, frame: Frame) {
    memory.copy_value(destination, frame.this_root)
  },
}

export function run_interpreter(runtime: Runtime, fiber: Fiber) {
  const { memory } = runtime
  // Widened so TS doesn't keep the narrowed status across calls that change it.
  fiber.status = FIBER_STATE.RUNNING as FiberStatus
  const temporary = memory.alloc_root(),
    operand = memory.alloc_root(),
    property_key = memory.alloc_root()
  try {
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
      const env = frame.environment_root
      let status: Status = OK
      switch (opcode) {
        case OP.LOAD_CONST:
          op.LOAD_CONST(memory, reg(a), code.constants[b])
          break
        case OP.MOVE:
          op.MOVE(memory, reg(a), reg(b))
          break
        case OP.LOAD_THIS:
          op.LOAD_THIS(memory, reg(a), fiber, frame)
          break
        case OP.LOAD_NEW_TARGET:
          op.LOAD_NEW_TARGET(memory, reg(a), fiber, frame)
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
          op.PUSH_ENV(memory, env, code, function_id, a, temporary)
          break
        case OP.POP_ENV:
          op.POP_ENV(memory, env, a, temporary)
          break
        case OP.COPY_ENV:
          op.COPY_ENV(memory, env, code, function_id, a, temporary, operand)
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
            property_key,
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
          status = op.GET_PROP(
            runtime,
            fiber,
            reg(a),
            reg(b),
            reg(c),
            property_key,
          )
          break
        case OP.SET_PROP:
          status = op.SET_PROP(
            runtime,
            fiber,
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
        case OP.DELETE_PROP:
          status = op.DELETE_PROP(runtime, reg(a), reg(b), reg(c), property_key)
          break
        case OP.SET_PROTO:
          op.SET_PROTO(memory, reg(a), reg(b))
          break
        case OP.TO_PROPERTY_KEY:
          status = op.TO_PROPERTY_KEY(runtime, reg(a), reg(b), property_key)
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
          op.SET_BEHAVIOR(memory, reg(a), reg(b), c === 1)
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
              op.CONSTRUCT(runtime, fiber, reg(a), reg(b), arguments_),
          )
          break
        case OP.RETURN:
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
          op.JUMP_IF(frame, !is_nullish(memory, reg(a)), b)
          break
        case OP.JUMP_IF_NOT_UNDEFINED:
          op.JUMP_IF(frame, tag_of(memory, reg(a)) !== TAGS.UNDEFINED, b)
          break
        case OP.JUMP_AND_LINK:
          op.JUMP_AND_LINK(memory, frame, reg(a), b)
          break
        case OP.JUMP_INDIRECT:
          op.JUMP_INDIRECT(memory, frame, reg(a))
          break
        case OP.GET_ITERATOR:
          status = op.GET_ITERATOR(runtime, reg(a), reg(b), reg(c), temporary)
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
          status = op.IN(runtime, reg(a), reg(b), reg(c), temporary)
          break
        case OP.INSTANCEOF:
          status = instance_of(runtime, reg(a), reg(b), reg(c))
          break
        case OP.NOT:
          write_boolean(memory, reg(a), !truthy(runtime, reg(b)))
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
      // The helper root must not retain environments after the instruction.
      write_undefined(memory, temporary)
      write_undefined(memory, operand)
      write_undefined(memory, property_key)
    }
    fiber.status = FIBER_STATE.READY
  } finally {
    memory.free_root(temporary)
    memory.free_root(operand)
    memory.free_root(property_key)
  }
}

export function run_task(runtime: Runtime, fiber: Fiber) {
  while (
    fiber.status === FIBER_STATE.READY ||
    fiber.status === FIBER_STATE.RUNNING
  )
    run_interpreter(runtime, fiber)
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
  const env = frame.environment_root
  while (environment_scope_id(runtime.memory, env) !== scope)
    environment_at(runtime.memory, env, env, 1)
}

// Unwinds frames to the innermost exception handler covering the throwing
// instruction, which is the one before each frame's pc.
function throw_value(runtime: Runtime, fiber: Fiber, source: Root) {
  const { memory } = runtime
  const value = memory.alloc_root()
  memory.copy_value(value, source)
  try {
    while (true) {
      const frame = fiber.frame
      if (frame === null) {
        memory.copy_value(fiber.error, value)
        fiber.status = FIBER_STATE.FAILED
        return
      }
      const pc = frame.pc - INSTRUCTION_BYTES
      const handler = runtime.loader.code[frame.code_id].unit.functions[
        frame.function_id
      ].handlers.find(({ start, end }) => pc >= start && pc < end)
      if (handler) {
        restore_environment(runtime, frame, handler.environment)
        memory.copy_value(
          frame.register(register_index(handler.register)),
          value,
        )
        frame.pc = bytecode_offset(handler.target)
        return
      }
      pop_frame(runtime, fiber)
    }
  } finally {
    memory.free_root(value)
  }
}

function return_value(runtime: Runtime, fiber: Fiber, source: Root) {
  const { memory } = runtime
  const frame = fiber.frame!
  const caller = frame.caller
  const value = memory.alloc_root()
  try {
    memory.copy_value(value, source)
    if (frame.is_construct_call && !is_object(memory, value))
      memory.copy_value(value, frame.this_root)
    memory.copy_value(
      caller === null ? fiber.result : frame.return_root!,
      value,
    )
    pop_frame(runtime, fiber)
    if (caller === null) fiber.status = FIBER_STATE.DONE
  } finally {
    memory.free_root(value)
  }
}
