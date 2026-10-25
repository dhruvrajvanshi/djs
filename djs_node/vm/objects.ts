import type { Root, HeapRef, Memory } from "./memory.ts"
import type {
  Literal,
  FunctionId,
  FunctionDescriptor,
} from "../compiler/compile.ts"
import type { Runtime, CodeId } from "../runtime/modules.ts"
import { KINDS, TAGS } from "./memory.ts"
import {
  get_ref,
  set_ref,
  tag_of,
  read_string,
  heap_string_length,
  heap_string_code_unit_at,
  read_number,
  read_boolean,
  write_undefined,
  write_uninitialized,
  write_number,
  write_string,
  write_boolean,
} from "./values.ts"
import { allocate } from "./heap.ts"
import { byte_buffer_view } from "./bytes.ts"
import { panic } from "../utils.ts"
import { OK, THROW, throw_error } from "./completion.ts"
import { set_realm_intrinsic } from "./intrinsics.ts"
import type { Status } from "./completion.ts"

export function kind_of(memory: Memory, value: Root) {
  return tag_of(memory, value) === TAGS.REF
    ? memory.read_u32(get_ref(memory, value))
    : 0
}

export function create_object(memory: Memory, destination: Root) {
  set_ref(memory, destination, allocate(memory, KINDS.OBJECT, 8))
  if (memory.object_prototype !== undefined)
    memory.write_u32(
      get_ref(memory, destination) + 12,
      get_ref(memory, memory.object_prototype),
    )
}

export function create_arguments_object(
  memory: Memory,
  destination: Root,
  arguments_: Root[],
) {
  create_object(memory, destination)
  const key = memory.alloc_root(),
    length = memory.alloc_root()
  try {
    write_string(memory, key, "length")
    write_number(memory, length, arguments_.length)
    define_property(memory, destination, key, length, 5)
    for (let index = 0; index < arguments_.length; index++) {
      write_string(memory, key, String(index))
      define_property(memory, destination, key, arguments_[index])
    }
  } finally {
    memory.free_root(key)
    memory.free_root(length)
  }
}

export function create_function(
  memory: Memory,
  destination: Root,
  code_id: number,
  function_id: number,
  environment?: Root,
  flags: number = 0,
  receiver?: Root,
  new_target?: Root,
  metadata?: Pick<FunctionDescriptor, "name" | "length">,
) {
  const reference = allocate(memory, KINDS.FUNCTION, 48)
  set_ref(memory, destination, reference)
  memory.write_u32(reference + 8, code_id)
  memory.write_u32(reference + 12, function_id)
  memory.write_u32(reference + 32, flags)
  if (memory.function_prototype !== undefined)
    memory.write_u32(reference + 28, get_ref(memory, memory.function_prototype))
  if (receiver !== undefined)
    memory.copy_root_to_heap_value(reference + 40, receiver)
  if (environment !== undefined)
    memory.copy_root_to_heap_value(reference + 16, environment)
  if (new_target !== undefined)
    memory.copy_root_to_heap_value(reference + 48, new_target)
  if (metadata) {
    const key = memory.alloc_root(),
      value = memory.alloc_root()
    try {
      write_string(memory, key, "length")
      write_number(memory, value, metadata.length)
      define_property(memory, destination, key, value, 4)
      write_string(memory, key, "name")
      write_string(memory, value, metadata.name)
      define_property(memory, destination, key, value, 4)
    } finally {
      memory.free_root(key)
      memory.free_root(value)
    }
  }
}

export function function_code_id(memory: Memory, callee: Root): CodeId {
  return memory.read_u32(get_ref(memory, callee) + 8) as CodeId
}

export function function_id(memory: Memory, callee: Root): FunctionId {
  return memory.read_u32(get_ref(memory, callee) + 12) as FunctionId
}

/** A built-in function whose steps also implement [[Construct]]. */
export const BUILTIN_CONSTRUCTOR = 32

/** Stores a built-in function's specification steps (ECMA-262 10.3). */
export function set_builtin_steps(
  memory: Memory,
  callee: Root,
  steps: Root,
  constructor: boolean,
) {
  const reference = get_ref(memory, callee)
  memory.write_u32(reference + 36, get_ref(memory, steps))
  if (constructor)
    memory.write_u32(
      reference + 32,
      memory.read_u32(reference + 32) | BUILTIN_CONSTRUCTOR,
    )
}

export function load_builtin_steps(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  const steps = memory.read_u32(get_ref(memory, callee) + 36)
  if (steps !== 0) set_ref(memory, destination, steps)
  return steps !== 0
}

export function function_flags(memory: Memory, callee: Root): number {
  return memory.read_u32(get_ref(memory, callee) + 32)
}

export function load_function_environment(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(destination, get_ref(memory, callee) + 16)
}

export function load_function_receiver(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(destination, get_ref(memory, callee) + 40)
}

export function load_function_new_target(
  memory: Memory,
  destination: Root,
  callee: Root,
) {
  memory.copy_heap_value_to_root(destination, get_ref(memory, callee) + 48)
}

export function create_environment(
  memory: Memory,
  destination: Root,
  parent: Root | undefined,
  binding_count: number,
  scope_id: number,
) {
  const reference = allocate(memory, KINDS.ENVIRONMENT, 16 + binding_count * 8)
  set_ref(memory, destination, reference)
  if (parent !== undefined)
    memory.copy_root_to_heap_value(reference + 8, parent)
  memory.write_u32(reference + 16, binding_count)
  memory.write_u32(reference + 20, scope_id)
  const temporary = memory.alloc_root()
  try {
    write_uninitialized(memory, temporary)
    for (let slot = 0; slot < binding_count; slot++) {
      memory.copy_root_to_heap_value(reference + 24 + slot * 8, temporary)
    }
  } finally {
    memory.free_root(temporary)
  }
}

export function copy_environment_bindings(
  memory: Memory,
  destination: Root,
  source: Root,
) {
  const count = memory.read_u32(get_ref(memory, source) + 16)
  const temporary = memory.alloc_root()
  try {
    for (let slot = 0; slot < count; slot++) {
      memory.copy_heap_value_to_root(
        temporary,
        get_ref(memory, source) + 24 + slot * 8,
      )
      memory.copy_root_to_heap_value(
        get_ref(memory, destination) + 24 + slot * 8,
        temporary,
      )
    }
  } finally {
    memory.free_root(temporary)
  }
}

export function environment_at(
  memory: Memory,
  destination: Root,
  environment: Root,
  depth: number,
) {
  memory.copy_value(destination, environment)
  for (let index = 0; index < depth; index++) {
    memory.copy_heap_value_to_root(
      destination,
      get_ref(memory, destination) + 8,
    )
  }
  if (kind_of(memory, destination) !== KINDS.ENVIRONMENT)
    panic("Invalid lexical environment")
}

export function load_binding(
  runtime: Runtime,
  destination: Root,
  environment: Root,
  slot: number,
): Status {
  const { memory } = runtime
  const reference = get_ref(memory, environment)
  if (slot >= memory.read_u32(reference + 16)) panic("Invalid binding slot")
  const scope = runtime.scopes[memory.read_u32(reference + 20)]
  const imported = scope.import_bindings?.get(slot)
  if (imported)
    return load_binding(
      runtime,
      destination,
      runtime.modules[imported.module_id].environment,
      imported.slot,
    )
  memory.copy_heap_value_to_root(destination, reference + 24 + slot * 8)
  if (tag_of(memory, destination) === TAGS.UNINITIALIZED)
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  return OK
}

function binding_uninitialized(memory: Memory, offset: number) {
  const previous = memory.alloc_root()
  try {
    memory.copy_heap_value_to_root(previous, offset)
    return tag_of(memory, previous) === TAGS.UNINITIALIZED
  } finally {
    memory.free_root(previous)
  }
}

export function initialize_binding(
  runtime: Runtime,
  environment: Root,
  slot: number,
  source: Root,
) {
  const { memory } = runtime
  const reference = get_ref(memory, environment)
  if (slot >= memory.read_u32(reference + 16)) panic("Invalid binding slot")
  const scope = runtime.scopes[memory.read_u32(reference + 20)]
  if (scope.import_bindings?.has(slot))
    panic("Cannot initialize an imported binding")
  const offset = reference + 24 + slot * 8
  if (!binding_uninitialized(memory, offset))
    panic("Binding is already initialized")
  memory.copy_root_to_heap_value(offset, source)
  const intrinsic = scope.intrinsic_bindings?.get(slot)
  if (intrinsic !== undefined) set_realm_intrinsic(runtime, intrinsic, source)
}

export function store_binding(
  runtime: Runtime,
  environment: Root,
  slot: number,
  source: Root,
): Status {
  const { memory } = runtime
  const reference = get_ref(memory, environment)
  if (slot >= memory.read_u32(reference + 16)) panic("Invalid binding slot")
  const scope = runtime.scopes[memory.read_u32(reference + 20)]
  if (scope.import_bindings?.has(slot))
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to an imported binding",
    )
  const offset = reference + 24 + slot * 8
  if (binding_uninitialized(memory, offset))
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  if (scope.binding_flags[slot])
    return throw_error(runtime, "TypeError", "Assignment to constant binding")
  memory.copy_root_to_heap_value(offset, source)
  return OK
}

// Object and function records have separate payloads but share property semantics.
function object_offsets(memory: Memory, object: Root): [number, number] {
  const kind = kind_of(memory, object)
  if (kind === KINDS.FUNCTION) return [24, 28]
  if (
    (
      [KINDS.OBJECT, KINDS.ERROR, KINDS.ARRAY, KINDS.STRING_OBJECT] as number[]
    ).includes(kind)
  )
    return [8, 12]
  panic("Expected an object")
}

/** Objects with an ordinary property list and prototype slot. */
export function has_property_list(memory: Memory, value: Root) {
  return (
    is_object(memory, value) && kind_of(memory, value) !== KINDS.BYTE_BUFFER
  )
}

/** Values whose properties the VM can read without boxing. */
export function has_properties(memory: Memory, value: Root) {
  const kind = kind_of(memory, value)
  return (
    kind === KINDS.STRING || kind === KINDS.SYMBOL || is_object(memory, value)
  )
}

/** String keys compare by contents; symbol and private keys by identity. */
export type PropertyKey = string | Root

export function property_key(memory: Memory, key: Root): PropertyKey {
  return kind_of(memory, key) === KINDS.SYMBOL ? key : to_string(memory, key)
}

function key_matches(memory: Memory, key: Root, name: PropertyKey) {
  return typeof name === "string"
    ? kind_of(memory, key) === KINDS.STRING && read_string(memory, key) === name
    : get_ref(memory, key) === get_ref(memory, name)
}

export function find_property(
  memory: Memory,
  object: Root,
  name: PropertyKey,
  own: boolean = false,
  private_key: boolean = false,
) {
  const [head, prototype] = object_offsets(memory, object)
  let reference = get_ref(memory, object)
  let property_head = head,
    prototype_offset = prototype
  const key = memory.alloc_root()
  try {
    while (reference !== 0) {
      let property = memory.read_u32(reference + property_head)
      while (property !== 0) {
        const flags = memory.read_u32(property + 12)
        if (Boolean(flags & 8) === private_key) {
          memory.copy_heap_value_to_root(key, property + 16)
          if (key_matches(memory, key, name)) return property
        }
        property = memory.read_u32(property + 8)
      }
      if (own || private_key) break
      reference = memory.read_u32(reference + prototype_offset)
      if (reference !== 0) {
        const kind = memory.read_u32(reference)
        property_head = kind === KINDS.FUNCTION ? 24 : 8
        prototype_offset = kind === KINDS.FUNCTION ? 28 : 12
      }
    }
    return 0
  } finally {
    memory.free_root(key)
  }
}

export function is_object(memory: Memory, value: Root) {
  return (
    [
      KINDS.OBJECT,
      KINDS.FUNCTION,
      KINDS.ERROR,
      KINDS.ARRAY,
      KINDS.STRING_OBJECT,
      KINDS.BYTE_BUFFER,
    ] as number[]
  ).includes(kind_of(memory, value))
}

function string_reference(memory: Memory, value: Root) {
  const kind = kind_of(memory, value)
  if (kind === KINDS.STRING) return get_ref(memory, value)
  if (kind === KINDS.STRING_OBJECT)
    return memory.read_u32(get_ref(memory, value) + 16)
  return 0
}

function array_index(name: string) {
  const index = Number(name)
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 0xffffffff &&
    String(index) === name
    ? index
    : -1
}

/** Physical properties point into the heap; virtual properties store host data. */
export interface OwnProperty {
  flags: number
  property?: HeapRef
  value?: string | number
}

/** Property references are temporary; root the loaded value before allocating. */
export function load_property_value(
  memory: Memory,
  destination: Root,
  property: HeapRef,
) {
  memory.copy_heap_value_to_root(destination, property + 24)
}

export function load_property_setter(
  memory: Memory,
  destination: Root,
  property: HeapRef,
) {
  memory.copy_heap_value_to_root(destination, property + 32)
}

export function store_property_setter(
  memory: Memory,
  property: HeapRef,
  setter: Root,
) {
  memory.copy_root_to_heap_value(property + 32, setter)
}

// Virtual descriptors contain only host numbers/strings, never unrooted VM refs.
function virtual_property(
  memory: Memory,
  object: Root,
  name: PropertyKey,
): OwnProperty | undefined {
  if (typeof name !== "string") return undefined
  const reference = string_reference(memory, object)
  if (reference) {
    const length = heap_string_length(memory, reference)
    if (name === "length") return { flags: 0, value: length }
    const index = array_index(name)
    if (index >= 0 && index < length)
      return {
        flags: 2,
        value: String.fromCharCode(
          heap_string_code_unit_at(memory, reference, index),
        ),
      }
  }
  if (kind_of(memory, object) === KINDS.BYTE_BUFFER) {
    const bytes = byte_buffer_view(memory, object)
    if (name === "length") return { flags: 0, value: bytes.length }
    const index = array_index(name)
    if (index >= 0 && index < bytes.length)
      return { flags: 3, value: bytes[index] }
  }
}

export function own_property(
  memory: Memory,
  object: Root,
  name: PropertyKey,
): OwnProperty | undefined {
  const virtual = virtual_property(memory, object, name)
  if (virtual) return virtual
  if (
    kind_of(memory, object) === KINDS.STRING ||
    kind_of(memory, object) === KINDS.SYMBOL ||
    kind_of(memory, object) === KINDS.BYTE_BUFFER
  )
    return undefined
  const property = find_property(memory, object, name, true)
  return property
    ? { property, flags: memory.read_u32(property + 12) }
    : undefined
}

function prototype_reference(memory: Memory, object: Root) {
  if (kind_of(memory, object) === KINDS.STRING)
    return memory.string_prototype === undefined
      ? 0
      : get_ref(memory, memory.string_prototype)
  if (kind_of(memory, object) === KINDS.SYMBOL)
    return memory.symbol_prototype === undefined
      ? 0
      : get_ref(memory, memory.symbol_prototype)
  if (kind_of(memory, object) === KINDS.BYTE_BUFFER) return 0
  const [, offset] = object_offsets(memory, object)
  return memory.read_u32(get_ref(memory, object) + offset)
}

// Return an accessor flag; only the interpreter invokes guest getters.
export function get_property(
  memory: Memory,
  destination: Root,
  object: Root,
  key: Root,
) {
  const name = property_key(memory, key)
  const current = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      const descriptor = own_property(memory, current, name)
      if (descriptor) {
        if (descriptor.property)
          memory.copy_heap_value_to_root(destination, descriptor.property + 24)
        else write_primitive(memory, destination, descriptor.value)
        return descriptor.flags & 16 ? 1 : 0
      }
      const prototype = prototype_reference(memory, current)
      if (!prototype) break
      set_ref(memory, current, prototype)
    }
    write_undefined(memory, destination)
    return 0
  } finally {
    memory.free_root(current)
  }
}

export function has_property(
  memory: Memory,
  object: Root,
  key: Root,
  own: boolean = false,
) {
  const name = property_key(memory, key),
    current = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      if (own_property(memory, current, name)) return true
      if (own) return false
      const prototype = prototype_reference(memory, current)
      if (!prototype) return false
      set_ref(memory, current, prototype)
    }
  } finally {
    memory.free_root(current)
  }
}

/** Returns false when the property is non-configurable. */
export function delete_property(memory: Memory, object: Root, key: Root) {
  const name = property_key(memory, key)
  const virtual = virtual_property(memory, object, name)
  if (virtual) return false
  if (!has_property_list(memory, object)) return true
  const [head] = object_offsets(memory, object)
  let link = get_ref(memory, object) + head
  let property = memory.read_u32(link)
  const temporary = memory.alloc_root()
  try {
    while (property) {
      if (!(memory.read_u32(property + 12) & 8)) {
        memory.copy_heap_value_to_root(temporary, property + 16)
        if (key_matches(memory, temporary, name)) {
          if (!(memory.read_u32(property + 12) & 4)) return false
          memory.write_u32(link, memory.read_u32(property + 8))
          return true
        }
      }
      link = property + 8
      property = memory.read_u32(link)
    }
    return true
  } finally {
    memory.free_root(temporary)
  }
}

function same_value(memory: Memory, left: Root, right: Root) {
  if (tag_of(memory, left) !== tag_of(memory, right)) return false
  if (tag_of(memory, left) === TAGS.REF) {
    if (
      kind_of(memory, left) === KINDS.STRING &&
      kind_of(memory, right) === KINDS.STRING
    )
      return read_string(memory, left) === read_string(memory, right)
    return get_ref(memory, left) === get_ref(memory, right)
  }
  return Object.is(primitive(memory, left), primitive(memory, right))
}

export function create_array(
  memory: Memory,
  destination: Root,
  length: number,
  prototype?: Root,
) {
  if (!Number.isInteger(length) || length < 0 || length > 0xffffffff)
    panic("Invalid array length")
  set_ref(memory, destination, allocate(memory, KINDS.ARRAY, 8))
  if (prototype === undefined) prototype = memory.array_prototype
  if (prototype !== undefined) set_prototype(memory, destination, prototype)
  const key = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    write_string(memory, key, "length")
    write_number(memory, value, length >>> 0)
    ordinary_define_property(memory, destination, key, value, 1)
  } finally {
    memory.free_root(key)
    memory.free_root(value)
  }
}

export function create_string_object(
  memory: Memory,
  destination: Root,
  value: Root,
  prototype?: Root,
) {
  if (kind_of(memory, value) !== KINDS.STRING) panic("Expected a string")
  // Root the source separately when the destination aliases the argument.
  const source = memory.alloc_root()
  try {
    memory.copy_value(source, value)
    set_ref(memory, destination, allocate(memory, KINDS.STRING_OBJECT, 16))
    memory.copy_root_to_heap_value(get_ref(memory, destination) + 16, source)
    if (prototype === undefined) prototype = memory.string_prototype
    if (prototype !== undefined) set_prototype(memory, destination, prototype)
  } finally {
    memory.free_root(source)
  }
}

export function string_object_set_value(
  memory: Memory,
  object: Root,
  value: Root,
) {
  if (kind_of(memory, value) !== KINDS.STRING) panic("Expected a string")
  memory.copy_root_to_heap_value(get_ref(memory, object) + 16, value)
}

export function object_prototype_reference(memory: Memory, object: Root) {
  return memory.read_u32(
    get_ref(memory, object) + object_offsets(memory, object)[1],
  )
}

export function string_value(memory: Memory, destination: Root, value: Root) {
  if (kind_of(memory, value) === KINDS.STRING)
    memory.copy_value(destination, value)
  else if (kind_of(memory, value) === KINDS.STRING_OBJECT)
    memory.copy_heap_value_to_root(destination, get_ref(memory, value) + 16)
  else panic("Receiver is not a string or String object")
}

export function define_property(
  memory: Memory,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  if (!try_define_property(memory, object, key, value, flags, setter))
    panic("Cannot redefine property")
}

/** Returns false when an existing non-configurable property forbids the change. */
export function try_define_property(
  memory: Memory,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  const name = flags & 8 ? undefined : property_key(memory, key)
  const virtual =
    name === undefined ? undefined : virtual_property(memory, object, name)
  if (virtual) {
    const previous = memory.alloc_root()
    try {
      write_primitive(memory, previous, virtual.value)
      return flags === virtual.flags && same_value(memory, previous, value)
    } finally {
      memory.free_root(previous)
    }
  }
  return ordinary_define_property(memory, object, key, value, flags, setter)
}

function ordinary_define_property(
  memory: Memory,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  const [head] = object_offsets(memory, object)
  const private_key = Boolean(flags & 8)
  const property = find_property(
    memory,
    object,
    private_key ? key : property_key(memory, key),
    true,
    private_key,
  )
  if (property !== 0) {
    const previous_flags = memory.read_u32(property + 12)
    if (!(previous_flags & 4)) {
      if (
        (flags & (2 | 4 | 16)) !== (previous_flags & (2 | 16)) ||
        (!(previous_flags & 1) && flags & 1)
      )
        return false
      if (previous_flags & 16 || !(previous_flags & 1)) {
        const previous = memory.alloc_root()
        try {
          memory.copy_heap_value_to_root(
            previous,
            property + (flags & 16 && setter !== undefined ? 32 : 24),
          )
          if (!same_value(memory, previous, value)) return false
        } finally {
          memory.free_root(previous)
        }
      }
    }
    if (flags & 16) {
      if (!(previous_flags & 16)) {
        memory.write_u32(property + 12, flags)
        const empty = memory.alloc_root()
        try {
          memory.copy_root_to_heap_value(property + 24, empty)
          memory.copy_root_to_heap_value(property + 32, empty)
        } finally {
          memory.free_root(empty)
        }
      }
      memory.copy_root_to_heap_value(
        property + (setter === undefined ? 24 : 32),
        value,
      )
      memory.write_u32(property + 12, flags)
      return true
    }
    memory.write_u32(property + 12, flags)
    memory.copy_root_to_heap_value(property + 24, value)
    if (previous_flags & 16) {
      const empty = memory.alloc_root()
      try {
        memory.copy_root_to_heap_value(property + 32, empty)
      } finally {
        memory.free_root(empty)
      }
    }
    return true
  }
  const normalized = memory.alloc_root()
  try {
    if (
      private_key ||
      kind_of(memory, key) === KINDS.STRING ||
      kind_of(memory, key) === KINDS.SYMBOL
    )
      memory.copy_value(normalized, key)
    else write_string(memory, normalized, to_string(memory, key))
    const reference = allocate(memory, KINDS.PROPERTY, private_key ? 24 : 32)
    const object_reference = get_ref(memory, object)
    memory.write_u32(reference + 8, memory.read_u32(object_reference + head))
    memory.write_u32(reference + 12, flags)
    memory.copy_root_to_heap_value(reference + 16, normalized)
    memory.copy_root_to_heap_value(
      reference + (flags & 16 && setter !== undefined ? 32 : 24),
      value,
    )
    memory.write_u32(object_reference + head, reference)
    return true
  } finally {
    memory.free_root(normalized)
  }
}

export type DefineValue = (
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags?: number,
  setter?: Root,
  value_only?: boolean,
) => Status

function define_ordinary_value(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags?: number,
) {
  if (!try_define_property(runtime.memory, object, key, value, flags))
    return throw_error(runtime, "TypeError", "Cannot redefine property")
  return OK
}

/** Loads the setter into `setter` when the assignment must call one. */
export function set_property(
  runtime: Runtime,
  setter: Root,
  object: Root,
  key: Root,
  value: Root,
  define: DefineValue = define_ordinary_value,
): Status {
  const { memory } = runtime
  write_undefined(memory, setter)
  if (kind_of(memory, object) === KINDS.BYTE_BUFFER) {
    const name =
        kind_of(memory, key) === KINDS.SYMBOL ? "" : to_string(memory, key),
      index = Number(name),
      bytes = byte_buffer_view(memory, object)
    if (name === "length")
      return throw_error(runtime, "TypeError", "Byte buffer length is readonly")
    if (
      String(index) !== name ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= bytes.length
    )
      return throw_error(runtime, "RangeError", "Invalid byte buffer index")
    if (tag_of(memory, value) !== TAGS.NUMBER)
      return throw_error(runtime, "TypeError", "Expected a numeric value")
    bytes[index] = read_number(memory, value)
    return OK
  }
  const name = property_key(memory, key)
  if (
    kind_of(memory, object) === KINDS.STRING ||
    virtual_property(memory, object, name)
  )
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to readonly string property",
    )
  const current = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      const descriptor = own_property(memory, current, name)
      if (descriptor) {
        if (descriptor.flags & 16) {
          load_property_setter(memory, setter, descriptor.property!)
          if (tag_of(memory, setter) === TAGS.UNDEFINED)
            return throw_error(runtime, "TypeError", "Property has no setter")
          return OK
        }
        if (!(descriptor.flags & 1))
          return throw_error(
            runtime,
            "TypeError",
            "Cannot assign to readonly property",
          )
        break
      }
      const prototype = prototype_reference(memory, current)
      if (!prototype) break
      set_ref(memory, current, prototype)
    }
    if (!has_property_list(memory, object))
      return throw_error(runtime, "TypeError", "Expected an object")
    const own = own_property(memory, object, name)
    return define(
      runtime,
      object,
      key,
      value,
      own ? own.flags : 7,
      undefined,
      Boolean(own),
    )
  } finally {
    memory.free_root(current)
  }
}

export function private_property(
  runtime: Runtime,
  destination: Root,
  object: Root,
  key: Root,
  value: Root | undefined,
  initialize: boolean = false,
  has: boolean = false,
  readonly: boolean = false,
): Status {
  const { memory } = runtime
  if (has && kind_of(memory, object) === KINDS.BYTE_BUFFER) {
    write_boolean(memory, destination, false)
    return OK
  }
  if (!has_property_list(memory, object))
    return throw_error(
      runtime,
      "TypeError",
      has ? "Private brand check requires an object" : "Expected an object",
    )
  const property = find_property(memory, object, key, true, true)
  if (has) {
    write_boolean(memory, destination, property !== 0)
    return OK
  }
  if (initialize) {
    if (property !== 0)
      return throw_error(
        runtime,
        "TypeError",
        "Private field is already initialized",
      )
    define_property(memory, object, key, value!, readonly ? 8 : 9)
  } else {
    if (property === 0)
      return throw_error(runtime, "TypeError", "Invalid private field receiver")
    if (value === undefined)
      memory.copy_heap_value_to_root(destination, property + 24)
    else {
      if (!(memory.read_u32(property + 12) & 1))
        return throw_error(runtime, "TypeError", "Private method is readonly")
      memory.copy_root_to_heap_value(property + 24, value)
    }
  }
  return OK
}

export function set_prototype(memory: Memory, object: Root, prototype: Root) {
  if (!try_set_prototype(memory, object, prototype)) panic("Cyclic prototype")
}

/** Returns false when the change would create a prototype cycle. */
export function try_set_prototype(
  memory: Memory,
  object: Root,
  prototype: Root,
) {
  const [, offset] = object_offsets(memory, object)
  const reference =
    tag_of(memory, prototype) === TAGS.NULL ? 0 : get_ref(memory, prototype)
  if (reference) object_offsets(memory, prototype)
  let current = reference
  while (current) {
    if (current === get_ref(memory, object)) return false
    current = memory.read_u32(
      current + (memory.read_u32(current) === KINDS.FUNCTION ? 28 : 12),
    )
  }
  memory.write_u32(get_ref(memory, object) + offset, reference)
  return true
}

export function create_value_array(
  memory: Memory,
  destination: Root,
  values: Root[],
) {
  const reference = allocate(memory, KINDS.VALUE_ARRAY, 8 + values.length * 8)
  set_ref(memory, destination, reference)
  memory.write_u32(reference + 8, values.length)
  for (let i = 0; i < values.length; i++)
    memory.copy_root_to_heap_value(reference + 16 + i * 8, values[i])
}

export function load_value_array_element(
  memory: Memory,
  destination: Root,
  array: Root,
  index: number,
) {
  const reference = get_ref(memory, array)
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= memory.read_u32(reference + 8)
  )
    panic("Invalid value array index")
  memory.copy_heap_value_to_root(destination, reference + 16 + index * 8)
}

export function mark_error_object(memory: Memory, object: Root) {
  object_offsets(memory, object)
  memory.write_u32(get_ref(memory, object), KINDS.ERROR)
}

function has_error_prototype(memory: Memory, value: Root) {
  let reference = get_ref(memory, value)
  while (reference !== 0) {
    if (memory.read_u32(reference) === KINDS.ERROR) return true
    reference = memory.read_u32(reference + 12)
  }
  return false
}

export function to_string(memory: Memory, value: Root): string {
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
      return "undefined"
    case TAGS.NULL:
      return "null"
    case TAGS.NUMBER:
      return String(read_number(memory, value))
    case TAGS.BOOLEAN:
      return String(read_boolean(memory, value))
    case TAGS.REF:
      switch (kind_of(memory, value)) {
        case KINDS.STRING:
          return read_string(memory, value)
        case KINDS.SYMBOL:
          panic("Cannot convert a Symbol value to a string")
        case KINDS.FUNCTION:
          return "[Function]"
        case KINDS.OBJECT:
          if (!has_error_prototype(memory, value)) return "[object Object]"
        case KINDS.ERROR: {
          const key = memory.alloc_root(),
            text = memory.alloc_root()
          try {
            write_string(memory, key, "name")
            get_property(memory, text, value, key)
            const name = to_string(memory, text)
            write_string(memory, key, "message")
            get_property(memory, text, value, key)
            return name + ": " + to_string(memory, text)
          } finally {
            memory.free_root(key)
            memory.free_root(text)
          }
        }
        default:
          return "[object Object]"
      }
    default:
      panic("Invalid internal value exposed to guest code")
  }
}

export function truthy(memory: Memory, value: Root) {
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
    case TAGS.NULL:
      return false
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.NUMBER:
      return Boolean(read_number(memory, value))
    case TAGS.REF:
      return (
        kind_of(memory, value) !== KINDS.STRING ||
        read_string(memory, value).length !== 0
      )
    default:
      panic("Invalid internal value")
  }
}

function primitive(memory: Memory, value: Root): Literal {
  switch (tag_of(memory, value)) {
    case TAGS.NUMBER:
      return read_number(memory, value)
    case TAGS.UNDEFINED:
      return undefined
    case TAGS.NULL:
      return null
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.REF:
      if (kind_of(memory, value) === KINDS.STRING)
        return read_string(memory, value)
      panic("Expected a primitive value")
    default:
      panic("Invalid internal value")
  }
}

export function write_primitive(
  memory: Memory,
  destination: Root,
  value: unknown,
) {
  if (typeof value === "string") write_string(memory, destination, value)
  else if (typeof value === "number") write_number(memory, destination, value)
  else if (typeof value === "boolean") write_boolean(memory, destination, value)
  else if (value === undefined) write_undefined(memory, destination)
  else panic("Unsupported primitive result")
}

// Host operators can only coerce primitives; objects must be converted first.
function check_primitive(runtime: Runtime, value: Root): Status {
  if (kind_of(runtime.memory, value) === KINDS.SYMBOL)
    return throw_error(runtime, "TypeError", "Cannot convert a Symbol value")
  if (kind_of(runtime.memory, value) > KINDS.STRING)
    return throw_error(
      runtime,
      "TypeError",
      "Object coercion is not implemented yet",
    )
  return OK
}

export function binary_operation(
  runtime: Runtime,
  destination: Root,
  left: Root,
  right: Root,
  operator: string,
): Status {
  const { memory } = runtime
  if (operator === "in") {
    if (!is_object(memory, right))
      panic("Right operand of in must be an object")
    write_boolean(memory, destination, has_property(memory, right, left))
    return OK
  }
  if (operator === "instanceof") {
    if (kind_of(memory, right) !== KINDS.FUNCTION)
      return throw_error(runtime, "TypeError", "Expected a constructor")
    const key = memory.alloc_root(),
      prototype = memory.alloc_root()
    try {
      write_string(memory, key, "prototype")
      get_property(memory, prototype, right, key)
      if (!has_property_list(memory, prototype))
        return throw_error(runtime, "TypeError", "Expected an object")
      let found = false
      if (
        (
          [
            KINDS.OBJECT,
            KINDS.FUNCTION,
            KINDS.ERROR,
            KINDS.ARRAY,
            KINDS.STRING_OBJECT,
          ] as number[]
        ).includes(kind_of(memory, left))
      ) {
        let reference = get_ref(memory, left)
        while (reference !== 0) {
          reference = memory.read_u32(
            reference +
              (memory.read_u32(reference) === KINDS.FUNCTION ? 28 : 12),
          )
          if (reference === get_ref(memory, prototype)) {
            found = true
            break
          }
        }
      }
      write_boolean(memory, destination, found)
      return OK
    } finally {
      memory.free_root(key)
      memory.free_root(prototype)
    }
  }
  if (
    ["===", "!==", "==", "!="].includes(operator) &&
    (kind_of(memory, left) > KINDS.STRING ||
      kind_of(memory, right) > KINDS.STRING)
  ) {
    const equal =
      tag_of(memory, left) === TAGS.REF &&
      tag_of(memory, right) === TAGS.REF &&
      get_ref(memory, left) === get_ref(memory, right)
    write_boolean(
      memory,
      destination,
      operator === "===" || operator === "==" ? equal : !equal,
    )
    return OK
  }
  if (check_primitive(runtime, left) === THROW) return THROW
  if (check_primitive(runtime, right) === THROW) return THROW
  // Host operators perform JavaScript coercion on the guest primitives.
  const a: any = primitive(memory, left),
    b: any = primitive(memory, right)
  let result
  switch (operator) {
    case "+":
      result = a + b
      break
    case "-":
      result = a - b
      break
    case "*":
      result = a * b
      break
    case "/":
      result = a / b
      break
    case "%":
      result = a % b
      break
    case "**":
      result = a ** b
      break
    case "===":
      result = a === b
      break
    case "!==":
      result = a !== b
      break
    case "==":
      result = a == b
      break
    case "!=":
      result = a != b
      break
    case "<":
      result = a < b
      break
    case "<=":
      result = a <= b
      break
    case ">":
      result = a > b
      break
    case ">=":
      result = a >= b
      break
    case "&":
      result = a & b
      break
    case "|":
      result = a | b
      break
    case "^":
      result = a ^ b
      break
    case "<<":
      result = a << b
      break
    case ">>":
      result = a >> b
      break
    case ">>>":
      result = a >>> b
      break
    default:
      panic(`Unsupported binary operator: ${operator}`)
  }
  write_primitive(memory, destination, result)
  return OK
}

export function unary_operation(
  runtime: Runtime,
  destination: Root,
  source: Root,
  operator: string,
): Status {
  const { memory } = runtime
  if (operator === "!") {
    write_boolean(memory, destination, !truthy(memory, source))
    return OK
  }
  if (operator === "void") {
    write_undefined(memory, destination)
    return OK
  }
  if (operator === "typeof") {
    const tag = tag_of(memory, source)
    const kind = kind_of(memory, source)
    const result =
      tag === TAGS.UNDEFINED
        ? "undefined"
        : tag === TAGS.NUMBER
          ? "number"
          : tag === TAGS.BOOLEAN
            ? "boolean"
            : kind === KINDS.STRING
              ? "string"
              : kind === KINDS.SYMBOL
                ? "symbol"
                : kind === KINDS.FUNCTION
                  ? "function"
                  : "object"
    write_string(memory, destination, result)
    return OK
  }
  if (check_primitive(runtime, source) === THROW) return THROW
  const value: any = primitive(memory, source)
  if (operator === "+") write_number(memory, destination, +value)
  else if (operator === "-") write_number(memory, destination, -value)
  else if (operator === "~") write_number(memory, destination, ~value)
  else panic(`Unsupported unary operator: ${operator}`)
  return OK
}

/** Own string keys in property order, followed by rooted symbol keys. */
function own_property_keys(memory: Memory, object: Root) {
  const [head] = object_offsets(memory, object)
  const names = []
  // Symbol keys are rooted individually since creating the result moves them.
  const symbols: Root[] = []
  const key = memory.alloc_root()
  try {
    let property = memory.read_u32(get_ref(memory, object) + head)
    while (property) {
      if (!(memory.read_u32(property + 12) & 8)) {
        memory.copy_heap_value_to_root(key, property + 16)
        if (kind_of(memory, key) === KINDS.SYMBOL) {
          const symbol = memory.alloc_root()
          memory.copy_value(symbol, key)
          symbols.push(symbol)
        } else names.push(read_string(memory, key))
      }
      property = memory.read_u32(property + 8)
    }
  } catch (error) {
    for (const symbol of symbols) memory.free_root(symbol)
    throw error
  } finally {
    memory.free_root(key)
  }
  names.reverse()
  symbols.reverse()
  if (kind_of(memory, object) === KINDS.STRING_OBJECT) {
    const reference = string_reference(memory, object)
    const length = heap_string_length(memory, reference)
    for (let index = 0; index < length; index++) names.push(String(index))
    names.unshift("length")
  }
  const indices = names
    .filter((name) => array_index(name) >= 0)
    .sort((a, b) => Number(a) - Number(b))
  return {
    names: indices.concat(names.filter((name) => array_index(name) < 0)),
    symbols,
  }
}

export function ordinary_own_property_keys(
  memory: Memory,
  destination: Root,
  object: Root,
) {
  const { names: ordered, symbols } = own_property_keys(memory, object)
  const key = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    create_array(memory, destination, ordered.length + symbols.length)
    for (let index = 0; index < ordered.length; index++) {
      write_string(memory, key, String(index))
      write_string(memory, value, ordered[index])
      ordinary_define_property(memory, destination, key, value, 7)
    }
    for (let index = 0; index < symbols.length; index++) {
      write_string(memory, key, String(ordered.length + index))
      ordinary_define_property(memory, destination, key, symbols[index], 7)
    }
  } finally {
    memory.free_root(key)
    memory.free_root(value)
    for (const symbol of symbols) memory.free_root(symbol)
  }
}

/**
 * Snapshots the enumerable string keys of an object and its prototype chain
 * for for-in. Shadowed keys appear once, under the nearest object.
 */
export function for_in_keys(memory: Memory, destination: Root, object: Root) {
  const visited = new Set<string>()
  const keys = []
  const current = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      const { names, symbols } = own_property_keys(memory, current)
      for (const symbol of symbols) memory.free_root(symbol)
      for (const name of names) {
        if (visited.has(name)) continue
        visited.add(name)
        if ((own_property(memory, current, name)?.flags ?? 0) & 2)
          keys.push(name)
      }
      const prototype = prototype_reference(memory, current)
      if (!prototype) break
      set_ref(memory, current, prototype)
    }
    create_array(memory, destination, keys.length)
    for (let index = 0; index < keys.length; index++) {
      write_string(memory, current, String(index))
      write_string(memory, value, keys[index])
      ordinary_define_property(memory, destination, current, value, 7)
    }
  } finally {
    memory.free_root(current)
    memory.free_root(value)
  }
}
