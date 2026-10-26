import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { BYTE_BUFFER, HEADER, KINDS } from "../storage/layout.ts"

export function create_byte_buffer(
  memory: Memory,
  destination: Root,
  length: number,
) {
  if (!Number.isSafeInteger(length) || length < 0 || length > 0x7ffffff0)
    panic("Invalid byte buffer length")
  const reference = memory.allocate(KINDS.BYTE_BUFFER, 4 + length)
  set_ref(memory, destination, reference)
  memory.write_u32(reference + BYTE_BUFFER.LENGTH, length)
}

// These views are temporary: moving GC invalidates their heap offsets.
export function byte_buffer_view(memory: Memory, buffer: Root) {
  const reference = get_ref(memory, buffer)
  if (memory.read_u32(reference + HEADER.KIND) !== KINDS.BYTE_BUFFER)
    panic("Expected a byte buffer")
  const start = reference + BYTE_BUFFER.BYTES
  return memory.heap.subarray(
    start,
    start + memory.read_u32(reference + BYTE_BUFFER.LENGTH),
  )
}
