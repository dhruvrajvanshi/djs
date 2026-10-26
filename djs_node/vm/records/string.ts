import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { HeapRef, Root } from "../storage/value.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { HEADER, KINDS, STRING } from "../storage/layout.ts"

export function write_string(memory: Memory, root: Root, text: string) {
  memory.assert_root(root)
  if (typeof text !== "string") panic("Expected a host string")
  const reference = memory.allocate(KINDS.STRING, 4 + text.length * 2)
  set_ref(memory, root, reference)
  memory.write_u32(reference + STRING.LENGTH, text.length)
  for (let index = 0; index < text.length; index++) {
    memory.heap_view.setUint16(
      reference + STRING.UNITS + index * 2,
      text.charCodeAt(index),
      true,
    )
  }
}

export function read_string(memory: Memory, root: Root) {
  const reference = get_ref(memory, root)
  const length = heap_string_length(memory, reference)
  let text = ""
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(
      memory.heap_view.getUint16(reference + STRING.UNITS + index * 2, true),
    )
  }
  return text
}

export function string_length(memory: Memory, value: Root) {
  return heap_string_length(memory, get_ref(memory, value))
}

/** Heap references are temporary; these accessors never allocate. */
export function heap_string_length(memory: Memory, reference: HeapRef) {
  if (memory.read_u32(reference + HEADER.KIND) !== KINDS.STRING)
    panic("Expected a string")
  return memory.read_u32(reference + STRING.LENGTH)
}

export function string_code_unit_at(
  memory: Memory,
  value: Root,
  index: number,
) {
  return heap_string_code_unit_at(memory, get_ref(memory, value), index)
}

export function heap_string_code_unit_at(
  memory: Memory,
  reference: HeapRef,
  index: number,
) {
  const length = heap_string_length(memory, reference)
  if (!Number.isInteger(index) || index < 0 || index >= length)
    panic("Invalid string index")
  return memory.heap_view.getUint16(reference + STRING.UNITS + index * 2, true)
}

export function slice_string(
  memory: Memory,
  destination: Root,
  value: Root,
  start: number,
  end: number,
) {
  const length = string_length(memory, value)
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > length
  )
    panic("Invalid string range")
  const reference = memory.allocate(KINDS.STRING, 4 + (end - start) * 2)
  // Allocation may move the source; read its root afterwards, before replacing
  // an aliased destination. copyWithin also handles overlapping storage safely.
  const source = get_ref(memory, value) + STRING.UNITS + start * 2
  memory.heap.copyWithin(
    reference + STRING.UNITS,
    source,
    source + (end - start) * 2,
  )
  memory.write_u32(reference + STRING.LENGTH, end - start)
  set_ref(memory, destination, reference)
}
