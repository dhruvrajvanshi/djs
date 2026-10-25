import type { Root, Memory } from "./memory.ts"
import type { Runtime } from "../runtime/modules.ts"
import {
  write_string,
  write_boolean,
  write_undefined,
  write_number,
} from "./values.ts"
import {
  create_object,
  define_property,
  try_define_property,
  has_property_list,
  own_property,
  load_property_value,
  load_property_setter,
  store_property_setter,
  get_property,
  has_property,
  truthy,
  to_string,
  property_key,
  kind_of,
  is_object,
} from "./objects.ts"
import { invoke_sync, coerce_value } from "./interpreter.ts"
import { KINDS, TAGS } from "./memory.ts"
import { tag_of, get_ref } from "./values.ts"
import { OK, THROW, throw_error } from "./completion.ts"
import type { Status } from "./completion.ts"

export function get_own_property_descriptor(
  memory: Memory,
  destination: Root,
  object: Root,
  key: Root,
) {
  const descriptor = own_property(memory, object, property_key(memory, key))
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
    create_object(memory, destination)
    write_string(memory, name, descriptor.flags & 16 ? "get" : "value")
    define_property(memory, destination, name, value)
    write_string(memory, name, descriptor.flags & 16 ? "set" : "writable")
    if (!(descriptor.flags & 16))
      write_boolean(memory, setter, Boolean(descriptor.flags & 1))
    define_property(memory, destination, name, setter)
    for (const [field, mask] of [
      ["enumerable", 2],
      ["configurable", 4],
    ] as [string, number][]) {
      write_string(memory, name, field)
      write_boolean(memory, value, Boolean(descriptor.flags & mask))
      define_property(memory, destination, name, value)
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
    const previous = own_property(memory, object, property_key(memory, key))
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
      if (!has_property(memory, descriptor, name)) return false
      if (get_property(memory, target, descriptor, name))
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
            memory,
            object,
            property_key(memory, key),
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
          flags = truthy(memory, writable) ? flags | 1 : flags & ~1
      }
      for (const [field_name, mask] of [
        ["enumerable", 2],
        ["configurable", 4],
      ] as [string, number][]) {
        const present = field(field_name, writable)
        if (present === THROW) return THROW
        if (present)
          flags = truthy(memory, writable) ? flags | mask : flags & ~mask
      }
      if (flags & 16) {
        // Validate a non-configurable accessor's two fields before changing either.
        const current = own_property(memory, object, property_key(memory, key))
        if (current && !(current.flags & 4)) {
          if (flags !== (current.flags & ~1))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          load_property_value(memory, value, current!.property!)
          if (!same_reference(memory, value, getter))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          load_property_setter(memory, value, current!.property!)
          if (!same_reference(memory, value, setter))
            return throw_error(runtime, "TypeError", "Cannot redefine property")
          return OK
        }
        if (!try_define_property(memory, object, key, getter, flags))
          return throw_error(runtime, "TypeError", "Cannot redefine property")
        const property = own_property(
          memory,
          object,
          property_key(memory, key),
        )!.property!
        store_property_setter(memory, property, setter)
      } else if (!try_define_property(memory, object, key, value, flags))
        return throw_error(runtime, "TypeError", "Cannot redefine property")
      return OK
    } finally {
      memory.free_root(writable)
    }
  } finally {
    for (const root of [name, value, getter, setter]) memory.free_root(root)
  }
}

function same_reference(memory: Memory, left: Root, right: Root) {
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
  const result = runtime.memory.alloc_root(),
    normalized = runtime.memory.alloc_root()
  try {
    if (
      kind_of(runtime.memory, key) === KINDS.STRING ||
      kind_of(runtime.memory, key) === KINDS.SYMBOL
    )
      runtime.memory.copy_value(normalized, key)
    else if (is_object(runtime.memory, key)) {
      if (coerce_value(runtime, normalized, key, "ToString") === THROW)
        return THROW
    } else
      write_string(runtime.memory, normalized, to_string(runtime.memory, key))
    if (
      invoke_sync(runtime, result, method, object, [normalized, descriptor]) ===
      THROW
    )
      return THROW
    if (tag_of(runtime.memory, result) !== TAGS.BOOLEAN)
      return throw_error(
        runtime,
        "TypeError",
        "DefineOwnProperty must return a boolean",
      )
    if (!truthy(runtime.memory, result))
      return throw_error(runtime, "TypeError", "Cannot define property")
    return OK
  } finally {
    runtime.memory.free_root(result)
    runtime.memory.free_root(normalized)
  }
}

// Array exotic objects define properties through the stdlib's
// @internal_method("array", "[[DefineOwnProperty]]"); other objects are ordinary.
function exotic_define_own_property(runtime: Runtime, object: Root) {
  if (kind_of(runtime.memory, object) !== KINDS.ARRAY) return undefined
  return runtime.intrinsics.get("array [[DefineOwnProperty]]")
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
    if (!try_define_property(memory, object, key, value, flags, setter))
      return throw_error(runtime, "TypeError", "Cannot redefine property")
    return OK
  }
  const descriptor = memory.alloc_root(),
    name = memory.alloc_root(),
    field = memory.alloc_root()
  try {
    create_object(memory, descriptor)
    write_string(
      memory,
      name,
      flags & 16 ? (setter === undefined ? "get" : "set") : "value",
    )
    define_property(memory, descriptor, name, value)
    if (!value_only) {
      for (const [text, mask] of [
        ["writable", 1],
        ["enumerable", 2],
        ["configurable", 4],
      ] as [string, number][]) {
        if (mask === 1 && flags & 16) continue
        write_string(memory, name, text)
        write_boolean(memory, field, Boolean(flags & mask))
        define_property(memory, descriptor, name, field)
      }
    }
    return invoke_define(runtime, method, object, key, descriptor)
  } finally {
    for (const root of [descriptor, name, field]) memory.free_root(root)
  }
}
