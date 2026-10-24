import type { Root, Memory } from "./memory.ts"
import type { Runtime } from "../runtime/modules.ts"
import { alloc_root, free_root, copy_value } from "./memory.ts"
import {
  write_string,
  write_boolean,
  write_undefined,
  write_number,
} from "./values.ts"
import {
  create_object,
  define_property,
  own_property,
  load_property_value,
  load_property_setter,
  store_property_setter,
  get_property,
  has_property,
  truthy,
  to_string,
  kind_of,
  is_object,
} from "./objects.ts"
import { invoke_sync, coerce_value } from "./interpreter.ts"
import { load_internal_method, INTERNAL } from "./builtins.ts"
import { KINDS, TAGS } from "./memory.ts"
import { tag_of, get_ref } from "./values.ts"

export function get_own_property_descriptor(
  memory: Memory,
  destination: Root,
  object: Root,
  key: Root,
) {
  const descriptor = own_property(memory, object, to_string(memory, key))
  if (!descriptor) {
    write_undefined(memory, destination)
    return
  }
  const value = alloc_root(memory),
    setter = alloc_root(memory),
    name = alloc_root(memory)
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
    free_root(memory, value)
    free_root(memory, setter)
    free_root(memory, name)
  }
}

// Intrinsic descriptors are trusted records of data fields. Public Object APIs
// can perform observable descriptor conversion in the stdlib before calling us.
export function define_own_property(
  memory: Memory,
  object: Root,
  key: Root,
  descriptor: Root,
  runtime?: Runtime,
  ordinary: boolean = false,
) {
  if (!ordinary && runtime && dispatch_define(runtime, object, key, descriptor))
    return

  if (!is_object(memory, descriptor))
    throw new TypeError("Expected a property descriptor")
  const name = alloc_root(memory),
    value = alloc_root(memory),
    getter = alloc_root(memory),
    setter = alloc_root(memory)
  try {
    const previous = own_property(memory, object, to_string(memory, key))
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
    function field(field_name: string, target: Root) {
      write_string(memory, name, field_name)
      if (!has_property(memory, descriptor, name)) return false
      if (get_property(memory, target, descriptor, name))
        throw new TypeError(
          "Intrinsic descriptor fields must be data properties",
        )
      return true
    }
    const accessor = field("get", getter),
      has_setter = field("set", setter)
    const has_value = field("value", value)
    const writable = alloc_root(memory)
    try {
      const has_writable = field("writable", writable)
      if ((accessor || has_setter) && (has_value || has_writable))
        throw new TypeError("Invalid mixed property descriptor")
      if (accessor || has_setter) {
        if (
          (accessor &&
            tag_of(memory, getter) !== TAGS.UNDEFINED &&
            kind_of(memory, getter) !== KINDS.FUNCTION) ||
          (has_setter &&
            tag_of(memory, setter) !== TAGS.UNDEFINED &&
            kind_of(memory, setter) !== KINDS.FUNCTION)
        )
          throw new TypeError("Accessor must be callable or undefined")
        if (!accessor && flags & 16) {
          const current = own_property(memory, object, to_string(memory, key))
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
        if (field(field_name, writable))
          flags = truthy(memory, writable) ? flags | mask : flags & ~mask
      }
      if (flags & 16) {
        // Validate a non-configurable accessor's two fields before changing either.
        const current = own_property(memory, object, to_string(memory, key))
        if (current && !(current.flags & 4)) {
          if (flags !== (current.flags & ~1))
            throw new TypeError("Cannot redefine property")
          load_property_value(memory, value, current!.property!)
          if (!same_reference(memory, value, getter))
            throw new TypeError("Cannot redefine property")
          load_property_setter(memory, value, current!.property!)
          if (!same_reference(memory, value, setter))
            throw new TypeError("Cannot redefine property")
          return
        }
        define_property(memory, object, key, getter, flags)
        const property = own_property(
          memory,
          object,
          to_string(memory, key),
        )!.property!
        store_property_setter(memory, property, setter)
      } else {
        define_property(memory, object, key, value, flags)
      }
    } finally {
      free_root(memory, writable)
    }
  } finally {
    for (const root of [name, value, getter, setter]) free_root(memory, root)
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
) {
  const result = alloc_root(runtime.memory),
    normalized = alloc_root(runtime.memory)
  try {
    if (kind_of(runtime.memory, key) === KINDS.STRING)
      copy_value(runtime.memory, normalized, key)
    else if (is_object(runtime.memory, key))
      coerce_value(runtime, normalized, key, "to_string")
    else
      write_string(runtime.memory, normalized, to_string(runtime.memory, key))
    invoke_sync(runtime, result, method, object, [normalized, descriptor])
    if (tag_of(runtime.memory, result) !== TAGS.BOOLEAN)
      throw new TypeError("DefineOwnProperty must return a boolean")
    if (!truthy(runtime.memory, result))
      throw new TypeError("Cannot define property")
  } finally {
    free_root(runtime.memory, result)
    free_root(runtime.memory, normalized)
  }
}

function dispatch_define(
  runtime: Runtime,
  object: Root,
  key: Root,
  descriptor: Root,
) {
  const method = alloc_root(runtime.memory)
  try {
    if (
      !load_internal_method(
        runtime.memory,
        method,
        object,
        INTERNAL.DefineOwnProperty,
      )
    )
      return false
    invoke_define(runtime, method, object, key, descriptor)
    return true
  } finally {
    free_root(runtime.memory, method)
  }
}

export function define_value_property(
  runtime: Runtime,
  object: Root,
  key: Root,
  value: Root,
  flags: number = 7,
  setter?: Root,
  value_only: boolean = false,
) {
  const { memory } = runtime
  const method = alloc_root(memory)
  try {
    if (
      !load_internal_method(memory, method, object, INTERNAL.DefineOwnProperty)
    ) {
      define_property(memory, object, key, value, flags, setter)
      return
    }
    const descriptor = alloc_root(memory),
      name = alloc_root(memory),
      field = alloc_root(memory)
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
      invoke_define(runtime, method, object, key, descriptor)
    } finally {
      for (const root of [descriptor, name, field]) free_root(memory, root)
    }
  } finally {
    free_root(memory, method)
  }
}
