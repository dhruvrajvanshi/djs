import { panic } from "../../utils.ts"
import type { Heap, Handle } from "../storage/heap.ts"
import {
  get_ref,
  heap_type_of,
  set_ref,
  type Address,
} from "../storage/value.ts"
import { HEAP_TYPES, STRING_OBJECT } from "../storage/layout.ts"
import { set_prototype } from "./object.ts"

/** An undefined prototype means null. */
export function allocate_string_object(
  heap: Heap,
  destination: Handle,
  value: Handle,
  prototype: Handle | undefined,
) {
  if (heap_type_of(heap, value) !== HEAP_TYPES.STRING)
    panic("Expected a string")
  // Handle the source separately when the destination aliases the argument.
  heap.handles.scope(() => {
    const source = heap.handles.local()
    heap.copy_value(source, value)
    set_ref(heap, destination, heap.allocate(HEAP_TYPES.STRING_OBJECT, 16))
    heap.store_value(get_ref(heap, destination) + STRING_OBJECT.VALUE, source)
    if (prototype !== undefined) set_prototype(heap, destination, prototype)
  })
}

export function string_object_set_value(
  heap: Heap,
  object: Handle,
  value: Handle,
) {
  if (heap_type_of(heap, value) !== HEAP_TYPES.STRING)
    panic("Expected a string")
  heap.store_value(get_ref(heap, object) + STRING_OBJECT.VALUE, value)
}

/** The string itself, or a String object's [[StringData]]. */
export function string_value(heap: Heap, destination: Handle, value: Handle) {
  if (heap_type_of(heap, value) === HEAP_TYPES.STRING)
    heap.copy_value(destination, value)
  else if (heap_type_of(heap, value) === HEAP_TYPES.STRING_OBJECT)
    heap.load_value(destination, get_ref(heap, value) + STRING_OBJECT.VALUE)
  else panic("Receiver is not a string or String object")
}

/** Heap reference of a string or a String object's string, otherwise 0. */
export function string_reference(heap: Heap, value: Handle): Address {
  const type = heap_type_of(heap, value)
  if (type === HEAP_TYPES.STRING) return get_ref(heap, value)
  if (type === HEAP_TYPES.STRING_OBJECT)
    return heap.read_u32(get_ref(heap, value) + STRING_OBJECT.VALUE)
  return 0
}
