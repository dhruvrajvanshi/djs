import type { Handle, Heap } from "../storage/heap.ts"
import type { Address } from "../storage/value.ts"
import { get_ref, heap_type_of } from "../storage/value.ts"
import {
  HEAP_TYPES,
  OBJECT,
  PROPERTY,
  PROPERTY_FLAGS,
} from "../storage/layout.ts"
import { read_string } from "./string.ts"
import {
  object_properties,
  set_object_properties,
  prototype_of_reference,
} from "./object.ts"

const { CONFIGURABLE, PRIVATE } = PROPERTY_FLAGS

// An accessor keeps its getter in VALUE and its setter in SETTER.

/** String keys compare by contents; symbol and private keys by identity. */
export type PropertyKey = string | Handle

function key_matches(heap: Heap, key: Handle, name: PropertyKey) {
  return typeof name === "string"
    ? heap_type_of(heap, key) === HEAP_TYPES.STRING &&
        read_string(heap, key) === name
    : get_ref(heap, key) === get_ref(heap, name)
}

/** Property addresses are temporary; load values into handles before allocating. */
export function find_property(
  heap: Heap,
  object: Handle,
  name: PropertyKey,
  own: boolean = false,
  private_key: boolean = false,
): Address {
  let property = object_properties(heap, object)
  let reference = get_ref(heap, object)
  return heap.handles.scope(() => {
    const key = heap.handles.local()
    while (true) {
      while (property !== 0) {
        if (Boolean(property_flags(heap, property) & PRIVATE) === private_key) {
          load_property_key(heap, key, property)
          if (key_matches(heap, key, name)) return property
        }
        property = next_property(heap, property)
      }
      if (own || private_key) return 0
      reference = prototype_of_reference(heap, reference)
      if (reference === 0) return 0
      property = heap.read_u32(reference + OBJECT.PROPERTIES)
    }
  })
}

export function next_property(heap: Heap, property: Address): Address {
  return heap.read_u32(property + PROPERTY.NEXT)
}

export function property_flags(heap: Heap, property: Address) {
  return heap.read_u32(property + PROPERTY.FLAGS)
}

export function set_property_flags(
  heap: Heap,
  property: Address,
  flags: number,
) {
  heap.write_u32(property + PROPERTY.FLAGS, flags)
}

export function load_property_key(
  heap: Heap,
  destination: Handle,
  property: Address,
) {
  heap.load_value(destination, property + PROPERTY.KEY)
}

export function load_property_value(
  heap: Heap,
  destination: Handle,
  property: Address,
) {
  heap.load_value(destination, property + PROPERTY.VALUE)
}

export function store_property_value(
  heap: Heap,
  property: Address,
  value: Handle,
) {
  heap.store_value(property + PROPERTY.VALUE, value)
}

export function load_property_setter(
  heap: Heap,
  destination: Handle,
  property: Address,
) {
  heap.load_value(destination, property + PROPERTY.SETTER)
}

export function store_property_setter(
  heap: Heap,
  property: Address,
  setter: Handle,
) {
  heap.store_value(property + PROPERTY.SETTER, setter)
}

/**
 * Prepends a property. The key must already be a string, symbol or
 * private key; `value` goes in SETTER when `is_setter` is set.
 */
export function insert_property(
  heap: Heap,
  object: Handle,
  key: Handle,
  flags: number,
  value: Handle,
  is_setter: boolean = false,
) {
  const reference = heap.allocate(
    HEAP_TYPES.PROPERTY,
    flags & PRIVATE ? 24 : 32,
  )
  heap.write_u32(reference + PROPERTY.NEXT, object_properties(heap, object))
  set_property_flags(heap, reference, flags)
  heap.store_value(reference + PROPERTY.KEY, key)
  heap.store_value(
    reference + (is_setter ? PROPERTY.SETTER : PROPERTY.VALUE),
    value,
  )
  set_object_properties(heap, object, reference)
}

/** Returns false when the property is non-configurable. */
export function remove_property(heap: Heap, object: Handle, name: PropertyKey) {
  let previous = 0
  let property = object_properties(heap, object)
  return heap.handles.scope(() => {
    const key = heap.handles.local()
    while (property) {
      if (!(property_flags(heap, property) & PRIVATE)) {
        load_property_key(heap, key, property)
        if (key_matches(heap, key, name)) {
          if (!(property_flags(heap, property) & CONFIGURABLE)) return false
          const next = next_property(heap, property)
          if (previous) heap.write_u32(previous + PROPERTY.NEXT, next)
          else set_object_properties(heap, object, next)
          return true
        }
      }
      previous = property
      property = next_property(heap, property)
    }
    return true
  })
}
