import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { Handle } from "../storage/heap.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { BYTE_BUFFER, HEADER, HEAP_TYPES } from "../storage/layout.ts"

export function create_byte_buffer(
  heap: Heap,
  destination: Handle,
  length: number,
) {
  if (!Number.isSafeInteger(length) || length < 0 || length > 0x7ffffff0)
    panic("Invalid byte buffer length")
  const reference = heap.allocate(HEAP_TYPES.BYTE_BUFFER, 4 + length)
  set_ref(heap, destination, reference)
  heap.write_u32(reference + BYTE_BUFFER.LENGTH, length)
}

// These views are temporary: moving GC invalidates their heap offsets.
export function byte_buffer_view(heap: Heap, buffer: Handle) {
  const reference = get_ref(heap, buffer)
  if (heap.read_u32(reference + HEADER.TYPE) !== HEAP_TYPES.BYTE_BUFFER)
    panic("Expected a byte buffer")
  const start = reference + BYTE_BUFFER.BYTES
  return heap.bytes.subarray(
    start,
    start + heap.read_u32(reference + BYTE_BUFFER.LENGTH),
  )
}
