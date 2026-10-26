import type { Memory } from "../storage/memory.ts"
import type { HeapRef, Root } from "../storage/value.ts"
import { get_ref, kind_of } from "../storage/value.ts"
import { KINDS, OBJECT, PROPERTY } from "../storage/layout.ts"
import { read_string } from "./string.ts"
import {
  object_properties,
  set_object_properties,
  prototype_of_reference,
} from "./object.ts"

// Flag bits: 1 writable, 2 enumerable, 4 configurable, 8 private, 16 accessor.
// An accessor keeps its getter in VALUE and its setter in SETTER.

/** String keys compare by contents; symbol and private keys by identity. */
export type PropertyKey = string | Root

function key_matches(memory: Memory, key: Root, name: PropertyKey) {
  return typeof name === "string"
    ? kind_of(memory, key) === KINDS.STRING && read_string(memory, key) === name
    : get_ref(memory, key) === get_ref(memory, name)
}

/** Property references are temporary; root loaded values before allocating. */
export function find_property(
  memory: Memory,
  object: Root,
  name: PropertyKey,
  own: boolean = false,
  private_key: boolean = false,
): HeapRef {
  let property = object_properties(memory, object)
  let reference = get_ref(memory, object)
  const key = memory.alloc_root()
  try {
    while (true) {
      while (property !== 0) {
        if (Boolean(property_flags(memory, property) & 8) === private_key) {
          load_property_key(memory, key, property)
          if (key_matches(memory, key, name)) return property
        }
        property = next_property(memory, property)
      }
      if (own || private_key) return 0
      reference = prototype_of_reference(memory, reference)
      if (reference === 0) return 0
      property = memory.read_u32(reference + OBJECT.PROPERTIES)
    }
  } finally {
    memory.free_root(key)
  }
}

export function next_property(memory: Memory, property: HeapRef): HeapRef {
  return memory.read_u32(property + PROPERTY.NEXT)
}

export function property_flags(memory: Memory, property: HeapRef) {
  return memory.read_u32(property + PROPERTY.FLAGS)
}

export function set_property_flags(
  memory: Memory,
  property: HeapRef,
  flags: number,
) {
  memory.write_u32(property + PROPERTY.FLAGS, flags)
}

export function load_property_key(
  memory: Memory,
  destination: Root,
  property: HeapRef,
) {
  memory.copy_heap_value_to_root(destination, property + PROPERTY.KEY)
}

export function load_property_value(
  memory: Memory,
  destination: Root,
  property: HeapRef,
) {
  memory.copy_heap_value_to_root(destination, property + PROPERTY.VALUE)
}

export function store_property_value(
  memory: Memory,
  property: HeapRef,
  value: Root,
) {
  memory.copy_root_to_heap_value(property + PROPERTY.VALUE, value)
}

export function load_property_setter(
  memory: Memory,
  destination: Root,
  property: HeapRef,
) {
  memory.copy_heap_value_to_root(destination, property + PROPERTY.SETTER)
}

export function store_property_setter(
  memory: Memory,
  property: HeapRef,
  setter: Root,
) {
  memory.copy_root_to_heap_value(property + PROPERTY.SETTER, setter)
}

/**
 * Prepends a property record. The key must already be a string, symbol or
 * private key; `value` goes in SETTER when `is_setter` is set.
 */
export function insert_property(
  memory: Memory,
  object: Root,
  key: Root,
  flags: number,
  value: Root,
  is_setter: boolean = false,
) {
  const reference = memory.allocate(KINDS.PROPERTY, flags & 8 ? 24 : 32)
  memory.write_u32(reference + PROPERTY.NEXT, object_properties(memory, object))
  set_property_flags(memory, reference, flags)
  memory.copy_root_to_heap_value(reference + PROPERTY.KEY, key)
  memory.copy_root_to_heap_value(
    reference + (is_setter ? PROPERTY.SETTER : PROPERTY.VALUE),
    value,
  )
  set_object_properties(memory, object, reference)
}

/** Returns false when the property is non-configurable. */
export function remove_property(
  memory: Memory,
  object: Root,
  name: PropertyKey,
) {
  let previous = 0
  let property = object_properties(memory, object)
  const key = memory.alloc_root()
  try {
    while (property) {
      if (!(property_flags(memory, property) & 8)) {
        load_property_key(memory, key, property)
        if (key_matches(memory, key, name)) {
          if (!(property_flags(memory, property) & 4)) return false
          const next = next_property(memory, property)
          if (previous) memory.write_u32(previous + PROPERTY.NEXT, next)
          else set_object_properties(memory, object, next)
          return true
        }
      }
      previous = property
      property = next_property(memory, property)
    }
    return true
  } finally {
    memory.free_root(key)
  }
}
