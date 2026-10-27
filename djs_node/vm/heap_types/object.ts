import { panic } from "../../utils.ts"
import type { Handle, Heap } from "../storage/heap.ts"
import type { Address } from "../storage/value.ts"
import {
  VALUE_TAGS,
  get_ref,
  heap_type_of,
  set_ref,
  tag_of,
} from "../storage/value.ts"
import {
  HEADER,
  HEAP_TYPES,
  OBJECT,
  is_object_type,
} from "../storage/layout.ts"

/** Allocates an ordinary object; an undefined prototype means null. */
export function allocate_object(
  heap: Heap,
  destination: Handle,
  prototype: Handle | undefined,
) {
  set_ref(heap, destination, heap.allocate(HEAP_TYPES.OBJECT, 8))
  if (prototype !== undefined)
    heap.write_u32(
      get_ref(heap, destination) + OBJECT.PROTOTYPE,
      get_ref(heap, prototype),
    )
}

/** Values the guest sees as objects. */
export function is_object(heap: Heap, value: Handle) {
  const type = heap_type_of(heap, value)
  return is_object_type(type) || type === HEAP_TYPES.BYTE_BUFFER
}

/** Objects with an ordinary property list and prototype slot. */
export function has_property_list(heap: Heap, value: Handle) {
  return is_object_type(heap_type_of(heap, value))
}

function object_reference(heap: Heap, object: Handle): Address {
  if (!has_property_list(heap, object)) panic("Expected an object")
  return get_ref(heap, object)
}

export function object_properties(heap: Heap, object: Handle): Address {
  return heap.read_u32(object_reference(heap, object) + OBJECT.PROPERTIES)
}

export function set_object_properties(
  heap: Heap,
  object: Handle,
  property: Address,
) {
  heap.write_u32(object_reference(heap, object) + OBJECT.PROPERTIES, property)
}

export function object_prototype_reference(
  heap: Heap,
  object: Handle,
): Address {
  return heap.read_u32(object_reference(heap, object) + OBJECT.PROTOTYPE)
}

/** Follows a raw prototype link; heap references are temporary. */
export function prototype_of_reference(heap: Heap, reference: Address) {
  return heap.read_u32(reference + OBJECT.PROTOTYPE)
}

export function set_prototype(heap: Heap, object: Handle, prototype: Handle) {
  if (!try_set_prototype(heap, object, prototype)) panic("Cyclic prototype")
}

/** Returns false when the change would create a prototype cycle. */
export function try_set_prototype(
  heap: Heap,
  object: Handle,
  prototype: Handle,
) {
  const target = object_reference(heap, object)
  const reference =
    tag_of(heap, prototype) === VALUE_TAGS.NULL
      ? 0
      : object_reference(heap, prototype)
  let current = reference
  while (current) {
    if (current === target) return false
    current = prototype_of_reference(heap, current)
  }
  heap.write_u32(target + OBJECT.PROTOTYPE, reference)
  return true
}

export function mark_error_object(heap: Heap, object: Handle) {
  heap.write_u32(object_reference(heap, object) + HEADER.TYPE, HEAP_TYPES.ERROR)
}
