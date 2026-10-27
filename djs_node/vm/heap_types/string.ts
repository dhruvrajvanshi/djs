import { panic } from "../../utils.ts"
import type { Handle, Heap } from "../storage/heap.ts"
import type { Address } from "../storage/value.ts"
import { get_ref, heap_type_of, set_ref } from "../storage/value.ts"
import { BYTE_BUFFER, HEADER, HEAP_TYPES, STRING } from "../storage/layout.ts"
import assert from "node:assert"

export function write_string(heap: Heap, destination: Handle, text: string) {
  heap.handles.assert_handle(destination)
  if (typeof text !== "string") panic("Expected a host string")
  const reference = heap.allocate(HEAP_TYPES.STRING, 4 + text.length * 2)
  set_ref(heap, destination, reference)
  heap.write_u32(reference + STRING.LENGTH, text.length)
  for (let index = 0; index < text.length; index++) {
    heap.view.setUint16(
      reference + STRING.UNITS + index * 2,
      text.charCodeAt(index),
      true,
    )
  }
}

export function read_string(heap: Heap, handle: Handle) {
  const reference = get_ref(heap, handle)
  const length = heap_string_length(heap, reference)
  let text = ""
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(
      heap.view.getUint16(reference + STRING.UNITS + index * 2, true),
    )
  }
  return text
}

export function string_length(heap: Heap, value: Handle) {
  assert(heap_type_of(heap, value) === HEAP_TYPES.STRING)
  return heap_string_length(heap, get_ref(heap, value))
}

/** Heap references are temporary; these accessors never allocate. */
export function heap_string_length(heap: Heap, reference: Address) {
  if (heap.read_u32(reference + HEADER.TYPE) !== HEAP_TYPES.STRING)
    panic("Expected a string")
  return heap.read_u32(reference + STRING.LENGTH)
}

export function string_code_unit_at(heap: Heap, value: Handle, index: number) {
  return heap_string_code_unit_at(heap, get_ref(heap, value), index)
}

export function heap_string_code_unit_at(
  heap: Heap,
  reference: Address,
  index: number,
) {
  const length = heap_string_length(heap, reference)
  if (!Number.isInteger(index) || index < 0 || index >= length)
    panic("Invalid string index")
  return heap.view.getUint16(reference + STRING.UNITS + index * 2, true)
}

export function slice_string(
  heap: Heap,
  destination: Handle,
  value: Handle,
  start: number,
  end: number,
) {
  const length = string_length(heap, value)
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > length
  )
    panic("Invalid string range")
  const reference = heap.allocate(HEAP_TYPES.STRING, 4 + (end - start) * 2)
  // Allocation may move the source; read its address afterwards, before replacing
  // an aliased destination. copyWithin also handles overlapping storage safely.
  const source = get_ref(heap, value) + STRING.UNITS + start * 2
  heap.bytes.copyWithin(
    reference + STRING.UNITS,
    source,
    source + (end - start) * 2,
  )
  heap.write_u32(reference + STRING.LENGTH, end - start)
  set_ref(heap, destination, reference)
}

/** Copies code units `start` to `end` of a byte buffer holding little-endian UTF-16. */
export function string_from_utf16(
  heap: Heap,
  destination: Handle,
  buffer: Handle,
  start: number,
  end: number,
) {
  const reference = heap.allocate(HEAP_TYPES.STRING, 4 + (end - start) * 2)
  // Allocation may move the buffer; read its address afterwards.
  const source = get_ref(heap, buffer) + BYTE_BUFFER.BYTES + start * 2
  heap.bytes.copyWithin(
    reference + STRING.UNITS,
    source,
    source + (end - start) * 2,
  )
  heap.write_u32(reference + STRING.LENGTH, end - start)
  set_ref(heap, destination, reference)
}
