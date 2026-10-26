import type { HeapRef, Root } from "../storage/value.ts"
import {
  TAGS,
  get_ref,
  kind_of,
  read_number,
  set_ref,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import {
  heap_string_code_unit_at,
  heap_string_length,
  read_string,
  write_string,
} from "../records/string.ts"
import { byte_buffer_view } from "../records/byte_buffer.ts"
import { string_reference } from "../records/string_object.ts"
import {
  has_property_list,
  is_object,
  object_properties,
  object_prototype_reference,
} from "../records/object.ts"
import type { PropertyKey } from "../records/property.ts"
import {
  find_property,
  insert_property,
  load_property_key,
  load_property_setter,
  load_property_value,
  next_property,
  property_flags,
  remove_property,
  set_property_flags,
  store_property_setter,
  store_property_value,
} from "../records/property.ts"
import { create_array, create_object } from "./objects.ts"
import { same_value, to_string, truthy, write_primitive } from "./operations.ts"
import { invoke_sync, coerce_value } from "../execution/calls.ts"
import { panic } from "../../utils.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

export type { PropertyKey } from "../records/property.ts"

/** Values whose properties the VM can read without boxing. */
export function has_properties(runtime: Runtime, value: Root) {
  const kind = kind_of(runtime.memory, value)
  return (
    kind === KINDS.STRING ||
    kind === KINDS.SYMBOL ||
    is_object(runtime.memory, value)
  )
}

export function property_key(runtime: Runtime, key: Root): PropertyKey {
  return kind_of(runtime.memory, key) === KINDS.SYMBOL
    ? key
    : to_string(runtime, key)
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

// Virtual descriptors contain only host numbers/strings, never unrooted VM refs.
function virtual_property(
  runtime: Runtime,
  object: Root,
  name: PropertyKey,
): OwnProperty | undefined {
  const { memory } = runtime
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
  runtime: Runtime,
  object: Root,
  name: PropertyKey,
): OwnProperty | undefined {
  const { memory } = runtime
  const virtual = virtual_property(runtime, object, name)
  if (virtual) return virtual
  const kind = kind_of(memory, object)
  if (
    kind === KINDS.STRING ||
    kind === KINDS.SYMBOL ||
    kind === KINDS.BYTE_BUFFER
  )
    return undefined
  const property = find_property(memory, object, name, true)
  return property
    ? { property, flags: property_flags(memory, property) }
    : undefined
}

// Strings and symbols inherit from the realm's prototypes.
function prototype_reference(runtime: Runtime, value: Root): HeapRef {
  const { memory, realm } = runtime
  const kind = kind_of(memory, value)
  const prototype =
    kind === KINDS.STRING
      ? realm.string_prototype
      : kind === KINDS.SYMBOL
        ? realm.symbol_prototype
        : null
  if (prototype !== null)
    return prototype === undefined ? 0 : get_ref(memory, prototype)
  if (kind === KINDS.BYTE_BUFFER) return 0
  return object_prototype_reference(memory, value)
}

// Return an accessor flag; only the interpreter invokes guest getters.
export function get_property(
  runtime: Runtime,
  destination: Root,
  object: Root,
  key: Root,
) {
  const { memory } = runtime
  const name = property_key(runtime, key)
  const current = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      const descriptor = own_property(runtime, current, name)
      if (descriptor) {
        if (descriptor.property)
          load_property_value(memory, destination, descriptor.property)
        else write_primitive(runtime, destination, descriptor.value)
        return descriptor.flags & 16 ? 1 : 0
      }
      const prototype = prototype_reference(runtime, current)
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
  runtime: Runtime,
  object: Root,
  key: Root,
  own: boolean = false,
) {
  const { memory } = runtime
  const name = property_key(runtime, key),
    current = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      if (own_property(runtime, current, name)) return true
      if (own) return false
      const prototype = prototype_reference(runtime, current)
      if (!prototype) return false
      set_ref(memory, current, prototype)
    }
  } finally {
    memory.free_root(current)
  }
}

/** Returns false when the property is non-configurable. */
export function delete_property(runtime: Runtime, object: Root, key: Root) {
  const name = property_key(runtime, key)
  if (virtual_property(runtime, object, name)) return false
  if (!has_property_list(runtime.memory, object)) return true
  return remove_property(runtime.memory, object, name)
}

export function define_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  if (!try_define_property(runtime, object, key, value, flags, setter))
    panic("Cannot redefine property")
}

/** Returns false when an existing non-configurable property forbids the change. */
export function try_define_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  const { memory } = runtime
  const name = flags & 8 ? undefined : property_key(runtime, key)
  const virtual =
    name === undefined ? undefined : virtual_property(runtime, object, name)
  if (virtual) {
    const previous = memory.alloc_root()
    try {
      write_primitive(runtime, previous, virtual.value)
      return flags === virtual.flags && same_value(runtime, previous, value)
    } finally {
      memory.free_root(previous)
    }
  }
  return ordinary_define_property(runtime, object, key, value, flags, setter)
}

function ordinary_define_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
) {
  const { memory } = runtime
  const private_key = Boolean(flags & 8)
  const property = find_property(
    memory,
    object,
    private_key ? key : property_key(runtime, key),
    true,
    private_key,
  )
  if (property !== 0) {
    const previous_flags = property_flags(memory, property)
    if (!(previous_flags & 4)) {
      if (
        (flags & (2 | 4 | 16)) !== (previous_flags & (2 | 16)) ||
        (!(previous_flags & 1) && flags & 1)
      )
        return false
      if (previous_flags & 16 || !(previous_flags & 1)) {
        const previous = memory.alloc_root()
        try {
          if (flags & 16 && setter !== undefined)
            load_property_setter(memory, previous, property)
          else load_property_value(memory, previous, property)
          if (!same_value(runtime, previous, value)) return false
        } finally {
          memory.free_root(previous)
        }
      }
    }
    if (flags & 16) {
      if (!(previous_flags & 16)) {
        set_property_flags(memory, property, flags)
        const empty = memory.alloc_root()
        try {
          store_property_value(memory, property, empty)
          store_property_setter(memory, property, empty)
        } finally {
          memory.free_root(empty)
        }
      }
      if (setter === undefined) store_property_value(memory, property, value)
      else store_property_setter(memory, property, value)
      set_property_flags(memory, property, flags)
      return true
    }
    set_property_flags(memory, property, flags)
    store_property_value(memory, property, value)
    if (previous_flags & 16) {
      const empty = memory.alloc_root()
      try {
        store_property_setter(memory, property, empty)
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
    else write_string(memory, normalized, to_string(runtime, key))
    insert_property(
      memory,
      object,
      normalized,
      flags,
      value,
      Boolean(flags & 16 && setter !== undefined),
    )
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
  if (!try_define_property(runtime, object, key, value, flags))
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
        kind_of(memory, key) === KINDS.SYMBOL ? "" : to_string(runtime, key),
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
  const name = property_key(runtime, key)
  if (
    kind_of(memory, object) === KINDS.STRING ||
    virtual_property(runtime, object, name)
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
      const descriptor = own_property(runtime, current, name)
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
      const prototype = prototype_reference(runtime, current)
      if (!prototype) break
      set_ref(memory, current, prototype)
    }
    if (!has_property_list(memory, object))
      return throw_error(runtime, "TypeError", "Expected an object")
    const own = own_property(runtime, object, name)
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
    define_property(runtime, object, key, value!, readonly ? 8 : 9)
  } else {
    if (property === 0)
      return throw_error(runtime, "TypeError", "Invalid private field receiver")
    if (value === undefined) load_property_value(memory, destination, property)
    else {
      if (!(property_flags(memory, property) & 1))
        return throw_error(runtime, "TypeError", "Private method is readonly")
      store_property_value(memory, property, value)
    }
  }
  return OK
}

/** Own string keys in property order, followed by rooted symbol keys. */
function own_property_keys(runtime: Runtime, object: Root) {
  const { memory } = runtime
  const names = []
  // Symbol keys are rooted individually since creating the result moves them.
  const symbols: Root[] = []
  const key = memory.alloc_root()
  try {
    let property = object_properties(memory, object)
    while (property) {
      if (!(property_flags(memory, property) & 8)) {
        load_property_key(memory, key, property)
        if (kind_of(memory, key) === KINDS.SYMBOL) {
          const symbol = memory.alloc_root()
          memory.copy_value(symbol, key)
          symbols.push(symbol)
        } else names.push(read_string(memory, key))
      }
      property = next_property(memory, property)
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
  runtime: Runtime,
  destination: Root,
  object: Root,
) {
  const { memory } = runtime
  const { names: ordered, symbols } = own_property_keys(runtime, object)
  const key = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    create_array(runtime, destination, ordered.length + symbols.length)
    for (let index = 0; index < ordered.length; index++) {
      write_string(memory, key, String(index))
      write_string(memory, value, ordered[index])
      ordinary_define_property(runtime, destination, key, value, 7)
    }
    for (let index = 0; index < symbols.length; index++) {
      write_string(memory, key, String(ordered.length + index))
      ordinary_define_property(runtime, destination, key, symbols[index], 7)
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
export function for_in_keys(runtime: Runtime, destination: Root, object: Root) {
  const { memory } = runtime
  const visited = new Set<string>()
  const keys = []
  const current = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    memory.copy_value(current, object)
    while (true) {
      const { names, symbols } = own_property_keys(runtime, current)
      for (const symbol of symbols) memory.free_root(symbol)
      for (const name of names) {
        if (visited.has(name)) continue
        visited.add(name)
        if ((own_property(runtime, current, name)?.flags ?? 0) & 2)
          keys.push(name)
      }
      const prototype = prototype_reference(runtime, current)
      if (!prototype) break
      set_ref(memory, current, prototype)
    }
    create_array(runtime, destination, keys.length)
    for (let index = 0; index < keys.length; index++) {
      write_string(memory, current, String(index))
      write_string(memory, value, keys[index])
      ordinary_define_property(runtime, destination, current, value, 7)
    }
  } finally {
    memory.free_root(current)
    memory.free_root(value)
  }
}

export function get_own_property_descriptor(
  runtime: Runtime,
  destination: Root,
  object: Root,
  key: Root,
) {
  const { memory } = runtime
  const descriptor = own_property(runtime, object, property_key(runtime, key))
  if (!descriptor) {
    write_undefined(memory, destination)
    return
  }
  const value = memory.alloc_root(),
    setter = memory.alloc_root(),
    name = memory.alloc_root()
  try {
    // Snapshot referenced values before allocating the result object.
    if (descriptor.property) {
      load_property_value(memory, value, descriptor.property)
      if (descriptor.flags & 16)
        load_property_setter(memory, setter, descriptor.property)
    } else if (typeof descriptor.value === "string")
      write_string(memory, value, descriptor.value!)
    else {
      // The virtual numeric fields are length and byte-buffer elements.
      write_number(memory, value, descriptor.value!)
    }
    create_object(runtime, destination)
    write_string(memory, name, descriptor.flags & 16 ? "get" : "value")
    define_property(runtime, destination, name, value)
    write_string(memory, name, descriptor.flags & 16 ? "set" : "writable")
    if (!(descriptor.flags & 16))
      write_boolean(memory, setter, Boolean(descriptor.flags & 1))
    define_property(runtime, destination, name, setter)
    for (const [field, mask] of [
      ["enumerable", 2],
      ["configurable", 4],
    ] as [string, number][]) {
      write_string(memory, name, field)
      write_boolean(memory, value, Boolean(descriptor.flags & mask))
      define_property(runtime, destination, name, value)
    }
  } finally {
    memory.free_root(value)
    memory.free_root(setter)
    memory.free_root(name)
  }
}

// Intrinsic descriptors are trusted records of data fields. Public Object APIs
// can perform observable descriptor conversion in the stdlib before calling us.
export function define_own_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  descriptor: Root,
  ordinary: boolean = false,
): Status {
  const { memory } = runtime
  if (!ordinary) {
    const status = dispatch_define(runtime, object, key, descriptor)
    if (status !== null) return status
  }
  if (!has_property_list(memory, object))
    return throw_error(runtime, "TypeError", "Expected an object")
  if (!is_object(memory, descriptor))
    return throw_error(runtime, "TypeError", "Expected a property descriptor")
  const name = memory.alloc_root(),
    value = memory.alloc_root(),
    getter = memory.alloc_root(),
    setter = memory.alloc_root()
  try {
    const previous = own_property(runtime, object, property_key(runtime, key))
    let flags = previous?.flags ?? 0
    if (flags & 16) flags &= ~1
    if (previous?.property) {
      load_property_value(memory, value, previous.property)
      if (flags & 16) {
        load_property_value(memory, getter, previous.property)
        load_property_setter(memory, setter, previous.property)
      }
    } else if (previous) {
      if (typeof previous.value === "string")
        write_string(memory, value, previous.value!)
      else write_number(memory, value, previous.value!)
    }
    // Fields are absent, present, or THROW for accessor fields.
    function field(field_name: string, target: Root) {
      write_string(memory, name, field_name)
      if (!has_property(runtime, descriptor, name)) return false
      if (get_property(runtime, target, descriptor, name))
        return throw_error(
          runtime,
          "TypeError",
          "Intrinsic descriptor fields must be data properties",
        )
      return true
    }
    const accessor = field("get", getter)
    if (accessor === THROW) return THROW
    const has_setter = field("set", setter)
    if (has_setter === THROW) return THROW
    const has_value = field("value", value)
    if (has_value === THROW) return THROW
    const writable = memory.alloc_root()
    try {
      const has_writable = field("writable", writable)
      if (has_writable === THROW) return THROW
      if ((accessor || has_setter) && (has_value || has_writable))
        return throw_error(
          runtime,
          "TypeError",
          "Invalid mixed property descriptor",
        )
      if (accessor || has_setter) {
        if (
          (accessor &&
            tag_of(memory, getter) !== TAGS.UNDEFINED &&
            kind_of(memory, getter) !== KINDS.FUNCTION) ||
          (has_setter &&
            tag_of(memory, setter) !== TAGS.UNDEFINED &&
            kind_of(memory, setter) !== KINDS.FUNCTION)
        )
          return throw_error(
            runtime,
            "TypeError",
            "Accessor must be callable or undefined",
          )
        if (!accessor && flags & 16) {
          const current = own_property(
            runtime,
            object,
            property_key(runtime, key),
          )
          load_property_value(memory, getter, current!.property!)
        }
        if (!(flags & 16) && !has_setter) write_undefined(memory, setter)
        flags = (flags & ~1) | 16
      } else if (has_value || has_writable) {
        if (flags & 16) {
          flags &= ~16
          if (!has_value) write_undefined(memory, value)
        }
        if (has_writable)
          flags = truthy(runtime, writable) ? flags | 1 : flags & ~1
      }
      for (const [field_name, mask] of [
        ["enumerable", 2],
        ["configurable", 4],
      ] as [string, number][]) {
        const present = field(field_name, writable)
        if (present === THROW) return THROW
        if (present)
          flags = truthy(runtime, writable) ? flags | mask : flags & ~mask
      }
      if (flags & 16) {
        // Validate a non-configurable accessor's two fields before changing either.
        const current = own_property(
          runtime,
          object,
          property_key(runtime, key),
        )
        if (current && !(current.flags & 4)) {
          if (flags !== (current.flags & ~1))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          load_property_value(memory, value, current!.property!)
          if (!same_reference(runtime, value, getter))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          load_property_setter(memory, value, current!.property!)
          if (!same_reference(runtime, value, setter))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          return OK
        }
        if (!try_define_property(runtime, object, key, getter, flags))
          return throw_error(runtime, "TypeError", "Cannot redefine property")
        const property = own_property(
          runtime,
          object,
          property_key(runtime, key),
        )!.property!
        store_property_setter(memory, property, setter)
      } else if (!try_define_property(runtime, object, key, value, flags))
        return throw_error(runtime, "TypeError", "Cannot redefine property")
      return OK
    } finally {
      memory.free_root(writable)
    }
  } finally {
    for (const root of [name, value, getter, setter]) memory.free_root(root)
  }
}

function same_reference(runtime: Runtime, left: Root, right: Root) {
  const { memory } = runtime
  return (
    tag_of(memory, left) === tag_of(memory, right) &&
    (tag_of(memory, left) === TAGS.UNDEFINED ||
      get_ref(memory, left) === get_ref(memory, right))
  )
}

function invoke_define(
  runtime: Runtime,
  method: Root,
  object: Root,
  key: Root,
  descriptor: Root,
): Status {
  const { memory } = runtime
  const result = memory.alloc_root(),
    normalized = memory.alloc_root()
  try {
    if (
      kind_of(memory, key) === KINDS.STRING ||
      kind_of(memory, key) === KINDS.SYMBOL
    )
      memory.copy_value(normalized, key)
    else if (is_object(memory, key)) {
      if (coerce_value(runtime, normalized, key, "ToString") === THROW)
        return THROW
    } else write_string(memory, normalized, to_string(runtime, key))
    if (
      invoke_sync(runtime, result, method, object, [normalized, descriptor]) ===
      THROW
    )
      return THROW
    if (tag_of(memory, result) !== TAGS.BOOLEAN)
      return throw_error(
        runtime,
        "TypeError",
        "DefineOwnProperty must return a boolean",
      )
    if (!truthy(runtime, result))
      return throw_error(runtime, "TypeError", "Cannot define property")
    return OK
  } finally {
    memory.free_root(result)
    memory.free_root(normalized)
  }
}

// Array exotic objects define properties through the stdlib's
// @internal_method("array", "[[DefineOwnProperty]]"); other objects are ordinary.
function exotic_define_own_property(runtime: Runtime, object: Root) {
  if (kind_of(runtime.memory, object) !== KINDS.ARRAY) return undefined
  return runtime.realm.intrinsics.get("array [[DefineOwnProperty]]")
}

// Returns null when the object is ordinary.
function dispatch_define(
  runtime: Runtime,
  object: Root,
  key: Root,
  descriptor: Root,
): Status | null {
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined) return null
  return invoke_define(runtime, method, object, key, descriptor)
}

export function define_value_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
  value_only: boolean = false,
): Status {
  const { memory } = runtime
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined) {
    if (!try_define_property(runtime, object, key, value, flags, setter))
      return throw_error(runtime, "TypeError", "Cannot redefine property")
    return OK
  }
  const descriptor = memory.alloc_root(),
    name = memory.alloc_root(),
    field = memory.alloc_root()
  try {
    create_object(runtime, descriptor)
    write_string(
      memory,
      name,
      flags & 16 ? (setter === undefined ? "get" : "set") : "value",
    )
    define_property(runtime, descriptor, name, value)
    if (!value_only) {
      for (const [text, mask] of [
        ["writable", 1],
        ["enumerable", 2],
        ["configurable", 4],
      ] as [string, number][]) {
        if (mask === 1 && flags & 16) continue
        write_string(memory, name, text)
        write_boolean(memory, field, Boolean(flags & mask))
        define_property(runtime, descriptor, name, field)
      }
    }
    return invoke_define(runtime, method, object, key, descriptor)
  } finally {
    for (const root of [descriptor, name, field]) memory.free_root(root)
  }
}
