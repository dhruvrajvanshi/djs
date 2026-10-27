import { panic } from "../../utils.ts"
import type { Handle, Heap } from "./heap.ts"
import { HEADER } from "./layout.ts"

/** Byte offset into the heap; invalidated when garbage collection moves objects. */
export type Address = number

// Every guest value is an eight-byte, little-endian slot: a binary64 number,
// or a NaN whose high word carries one of these tags.
export const VALUE_BYTES = 8
export const NAN_HIGH = 0x7ff80000
export const VALUE_TAGS = Object.freeze({
  NUMBER: 0,
  UNDEFINED: 1,
  NULL: 2,
  BOOLEAN: 3,
  REF: 4,
  UNINITIALIZED: 5,
  HOLE: 6,
})

function write_tag(
  heap: Heap,
  handle: Handle,
  tag: number,
  payload: number = 0,
) {
  heap.handles.assert_handle(handle)
  heap.handles.view.setUint32(handle * VALUE_BYTES, payload, true)
  heap.handles.view.setUint32(handle * VALUE_BYTES + 4, NAN_HIGH | tag, true)
}

export function tag_of(heap: Heap, handle: Handle) {
  heap.handles.assert_handle(handle)
  const high = heap.handles.view.getUint32(handle * VALUE_BYTES + 4, true)
  const tag = high - NAN_HIGH
  return tag > 0 && tag <= VALUE_TAGS.HOLE ? tag : VALUE_TAGS.NUMBER
}

/** The heap type of a reference value, or 0 for any other value. */
export function heap_type_of(heap: Heap, value: Handle) {
  return tag_of(heap, value) === VALUE_TAGS.REF
    ? heap.read_u32(get_ref(heap, value) + HEADER.TYPE)
    : 0
}

export function write_number(heap: Heap, handle: Handle, value: number) {
  heap.handles.assert_handle(handle)
  if (typeof value !== "number") panic("Expected a host number")
  if (Number.isNaN(value)) {
    heap.handles.view.setUint32(handle * VALUE_BYTES, 0, true)
    heap.handles.view.setUint32(handle * VALUE_BYTES + 4, NAN_HIGH, true)
  } else {
    heap.handles.view.setFloat64(handle * VALUE_BYTES, value, true)
  }
}

export function read_number(heap: Heap, handle: Handle) {
  if (tag_of(heap, handle) !== VALUE_TAGS.NUMBER)
    panic("Expected a numeric value")
  return heap.handles.view.getFloat64(handle * VALUE_BYTES, true)
}

export function write_undefined(heap: Heap, handle: Handle) {
  write_tag(heap, handle, VALUE_TAGS.UNDEFINED)
}

export function write_null(heap: Heap, handle: Handle) {
  write_tag(heap, handle, VALUE_TAGS.NULL)
}

export function write_boolean(heap: Heap, handle: Handle, value: boolean) {
  write_tag(heap, handle, VALUE_TAGS.BOOLEAN, value ? 1 : 0)
}

export function read_boolean(heap: Heap, handle: Handle) {
  if (tag_of(heap, handle) !== VALUE_TAGS.BOOLEAN)
    panic("Expected a boolean value")
  return heap.handles.view.getUint32(handle * VALUE_BYTES, true) !== 0
}

export function write_uninitialized(heap: Heap, handle: Handle) {
  write_tag(heap, handle, VALUE_TAGS.UNINITIALIZED)
}

export function write_hole(heap: Heap, handle: Handle) {
  write_tag(heap, handle, VALUE_TAGS.HOLE)
}

export function set_ref(heap: Heap, handle: Handle, reference: Address) {
  write_tag(heap, handle, VALUE_TAGS.REF, reference)
}

export function get_ref(heap: Heap, handle: Handle): Address {
  if (tag_of(heap, handle) !== VALUE_TAGS.REF)
    panic("Expected a heap reference")
  return heap.handles.view.getUint32(handle * VALUE_BYTES, true)
}

export function is_nullish(heap: Heap, value: Handle) {
  const tag = tag_of(heap, value)
  return tag === VALUE_TAGS.NULL || tag === VALUE_TAGS.UNDEFINED
}
