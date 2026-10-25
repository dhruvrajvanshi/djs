import { panic } from "../utils.ts"
import type { Root, Memory } from "./memory.ts"
import { KINDS } from "./memory.ts"
import { allocate } from "./heap.ts"
import { get_ref, set_ref } from "./values.ts"

export function create_byte_buffer(
  memory: Memory,
  destination: Root,
  length: number,
) {
  if (!Number.isSafeInteger(length) || length < 0 || length > 0x7ffffff0)
    panic("Invalid byte buffer length")
  const reference = allocate(memory, KINDS.BYTE_BUFFER, 4 + length)
  set_ref(memory, destination, reference)
  memory.write_u32(reference + 8, length)
}

// These views are temporary: moving GC invalidates their heap offsets.
export function byte_buffer_view(memory: Memory, buffer: Root) {
  const reference = get_ref(memory, buffer)
  if (memory.read_u32(reference) !== KINDS.BYTE_BUFFER)
    panic("Expected a byte buffer")
  return memory.heap.subarray(
    reference + 12,
    reference + 12 + memory.read_u32(reference + 8),
  )
}
