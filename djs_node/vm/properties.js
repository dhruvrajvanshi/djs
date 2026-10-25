import {
  alloc_root,
  free_root,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
} from "./memory.js"
import {
  write_string,
  write_boolean,
  write_undefined,
  write_number,
} from "./values.js"
import {
  create_object,
  define_property,
  own_property,
  get_property,
  has_property,
  truthy,
  to_string,
  kind_of,
} from "./objects.js"
import { coerce_array_length } from "./interpreter.js"
import { KINDS, TAGS } from "./memory.js"
import { tag_of, get_ref } from "./values.js"

export function get_own_property_descriptor(memory, destination, object, key) {
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
      copy_heap_value_to_root(memory, value, descriptor.property + 24)
      if (descriptor.flags & 16)
        copy_heap_value_to_root(memory, setter, descriptor.property + 32)
    } else if (typeof descriptor.value === "string")
      write_string(memory, value, descriptor.value)
    else {
      // The virtual numeric fields are length and byte-buffer elements.
      write_number(memory, value, descriptor.value)
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
    ]) {
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
export function define_own_property(memory, object, key, descriptor, runtime) {
  if (
    ![
      KINDS.OBJECT,
      KINDS.FUNCTION,
      KINDS.ERROR,
      KINDS.ARRAY,
      KINDS.STRING_OBJECT,
    ].includes(kind_of(memory, descriptor))
  )
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
      copy_heap_value_to_root(memory, value, previous.property + 24)
      if (flags & 16) {
        copy_heap_value_to_root(memory, getter, previous.property + 24)
        copy_heap_value_to_root(memory, setter, previous.property + 32)
      }
    } else if (previous) {
      if (typeof previous.value === "string")
        write_string(memory, value, previous.value)
      else write_number(memory, value, previous.value)
    }
    function field(field_name, target) {
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
          copy_heap_value_to_root(memory, getter, current.property + 24)
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
      ]) {
        if (field(field_name, writable))
          flags = truthy(memory, writable) ? flags | mask : flags & ~mask
      }
      if (flags & 16) {
        // Validate a non-configurable accessor's two fields before changing either.
        const current = own_property(memory, object, to_string(memory, key))
        if (current && !(current.flags & 4)) {
          if (flags !== (current.flags & ~1))
            throw new TypeError("Cannot redefine property")
          copy_heap_value_to_root(memory, value, current.property + 24)
          if (!same_reference(memory, value, getter))
            throw new TypeError("Cannot redefine property")
          copy_heap_value_to_root(memory, value, current.property + 32)
          if (!same_reference(memory, value, setter))
            throw new TypeError("Cannot redefine property")
          return
        }
        define_property(memory, object, key, getter, flags)
        const property = own_property(
          memory,
          object,
          to_string(memory, key),
        ).property
        copy_root_to_heap_value(memory, property + 32, setter)
      } else {
        if (
          has_value &&
          kind_of(memory, object) === KINDS.ARRAY &&
          to_string(memory, key) === "length" &&
          runtime &&
          [
            KINDS.OBJECT,
            KINDS.FUNCTION,
            KINDS.ERROR,
            KINDS.ARRAY,
            KINDS.STRING_OBJECT,
          ].includes(kind_of(memory, value))
        )
          coerce_array_length(runtime, value, value)
        define_property(memory, object, key, value, flags)
      }
    } finally {
      free_root(memory, writable)
    }
  } finally {
    for (const root of [name, value, getter, setter]) free_root(memory, root)
  }
}

function same_reference(memory, left, right) {
  return (
    tag_of(memory, left) === tag_of(memory, right) &&
    (tag_of(memory, left) === TAGS.UNDEFINED ||
      get_ref(memory, left) === get_ref(memory, right))
  )
}
