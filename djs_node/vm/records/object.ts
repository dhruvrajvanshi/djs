import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { HeapRef, Root } from "../storage/value.ts"
import { TAGS, get_ref, kind_of, set_ref, tag_of } from "../storage/value.ts"
import { HEADER, KINDS, OBJECT, is_object_kind } from "../storage/layout.ts"

/** Allocates an ordinary object; an undefined prototype means null. */
export function allocate_object(
  memory: Memory,
  destination: Root,
  prototype: Root | undefined,
) {
  set_ref(memory, destination, memory.allocate(KINDS.OBJECT, 8))
  if (prototype !== undefined)
    memory.write_u32(
      get_ref(memory, destination) + OBJECT.PROTOTYPE,
      get_ref(memory, prototype),
    )
}

/** Values the guest sees as objects. */
export function is_object(memory: Memory, value: Root) {
  const kind = kind_of(memory, value)
  return is_object_kind(kind) || kind === KINDS.BYTE_BUFFER
}

/** Objects with an ordinary property list and prototype slot. */
export function has_property_list(memory: Memory, value: Root) {
  return is_object_kind(kind_of(memory, value))
}

function object_reference(memory: Memory, object: Root): HeapRef {
  if (!has_property_list(memory, object)) panic("Expected an object")
  return get_ref(memory, object)
}

export function object_properties(memory: Memory, object: Root): HeapRef {
  return memory.read_u32(object_reference(memory, object) + OBJECT.PROPERTIES)
}

export function set_object_properties(
  memory: Memory,
  object: Root,
  property: HeapRef,
) {
  memory.write_u32(
    object_reference(memory, object) + OBJECT.PROPERTIES,
    property,
  )
}

export function object_prototype_reference(
  memory: Memory,
  object: Root,
): HeapRef {
  return memory.read_u32(object_reference(memory, object) + OBJECT.PROTOTYPE)
}

/** Follows a raw prototype link; heap references are temporary. */
export function prototype_of_reference(memory: Memory, reference: HeapRef) {
  return memory.read_u32(reference + OBJECT.PROTOTYPE)
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
  const target = object_reference(memory, object)
  const reference =
    tag_of(memory, prototype) === TAGS.NULL
      ? 0
      : object_reference(memory, prototype)
  let current = reference
  while (current) {
    if (current === target) return false
    current = prototype_of_reference(memory, current)
  }
  memory.write_u32(target + OBJECT.PROTOTYPE, reference)
  return true
}

export function mark_error_object(memory: Memory, object: Root) {
  memory.write_u32(object_reference(memory, object) + HEADER.KIND, KINDS.ERROR)
}

export function has_error_prototype(memory: Memory, value: Root) {
  let reference = object_reference(memory, value)
  while (reference !== 0) {
    if (memory.read_u32(reference + HEADER.KIND) === KINDS.ERROR) return true
    reference = prototype_of_reference(memory, reference)
  }
  return false
}
