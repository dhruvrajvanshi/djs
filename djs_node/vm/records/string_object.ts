import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { HeapRef, Root } from "../storage/value.ts"
import { get_ref, kind_of, set_ref } from "../storage/value.ts"
import { KINDS, STRING_OBJECT } from "../storage/layout.ts"
import { set_prototype } from "./object.ts"

/** An undefined prototype means null. */
export function allocate_string_object(
  memory: Memory,
  destination: Root,
  value: Root,
  prototype: Root | undefined,
) {
  if (kind_of(memory, value) !== KINDS.STRING) panic("Expected a string")
  // Root the source separately when the destination aliases the argument.
  const source = memory.alloc_root()
  try {
    memory.copy_value(source, value)
    set_ref(memory, destination, memory.allocate(KINDS.STRING_OBJECT, 16))
    memory.copy_root_to_heap_value(
      get_ref(memory, destination) + STRING_OBJECT.VALUE,
      source,
    )
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
  memory.copy_root_to_heap_value(
    get_ref(memory, object) + STRING_OBJECT.VALUE,
    value,
  )
}

/** The string itself, or a String object's [[StringData]]. */
export function string_value(memory: Memory, destination: Root, value: Root) {
  if (kind_of(memory, value) === KINDS.STRING)
    memory.copy_value(destination, value)
  else if (kind_of(memory, value) === KINDS.STRING_OBJECT)
    memory.copy_heap_value_to_root(
      destination,
      get_ref(memory, value) + STRING_OBJECT.VALUE,
    )
  else panic("Receiver is not a string or String object")
}

/** Heap reference of a string or a String object's string, otherwise 0. */
export function string_reference(memory: Memory, value: Root): HeapRef {
  const kind = kind_of(memory, value)
  if (kind === KINDS.STRING) return get_ref(memory, value)
  if (kind === KINDS.STRING_OBJECT)
    return memory.read_u32(get_ref(memory, value) + STRING_OBJECT.VALUE)
  return 0
}
