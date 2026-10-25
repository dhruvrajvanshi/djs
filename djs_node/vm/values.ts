import type { Root, HeapRef, Memory } from "./memory.ts"
import {
  KINDS,
  NAN_HIGH,
  TAGS,
  assert_root,
  read_u32,
  write_u32,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
} from "./memory.ts"
import { allocate } from "./heap.ts"

export { TAGS, KINDS, copy_value } from "./memory.ts"

function write_tag(
  memory: Memory,
  root: Root,
  tag: number,
  payload: number = 0,
) {
  assert_root(memory, root)
  memory.roots_view.setUint32(root * 8, payload, true)
  memory.roots_view.setUint32(root * 8 + 4, NAN_HIGH | tag, true)
}

export function tag_of(memory: Memory, root: Root) {
  assert_root(memory, root)
  const high = memory.roots_view.getUint32(root * 8 + 4, true)
  const tag = high - NAN_HIGH
  return tag > 0 && tag <= TAGS.HOLE ? tag : TAGS.NUMBER
}

export function write_number(memory: Memory, root: Root, value: number) {
  assert_root(memory, root)
  if (typeof value !== "number") throw new TypeError("Expected a host number")
  if (Number.isNaN(value)) {
    memory.roots_view.setUint32(root * 8, 0, true)
    memory.roots_view.setUint32(root * 8 + 4, NAN_HIGH, true)
  } else {
    memory.roots_view.setFloat64(root * 8, value, true)
  }
}

export function read_number(memory: Memory, root: Root) {
  if (tag_of(memory, root) !== TAGS.NUMBER)
    throw new TypeError("Expected a numeric value")
  return memory.roots_view.getFloat64(root * 8, true)
}

export function write_undefined(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.UNDEFINED)
}

export function write_null(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.NULL)
}

export function write_boolean(memory: Memory, root: Root, value: boolean) {
  write_tag(memory, root, TAGS.BOOLEAN, value ? 1 : 0)
}

export function read_boolean(memory: Memory, root: Root) {
  if (tag_of(memory, root) !== TAGS.BOOLEAN)
    throw new TypeError("Expected a boolean value")
  return memory.roots_view.getUint32(root * 8, true) !== 0
}

export function write_uninitialized(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.UNINITIALIZED)
}

export function write_hole(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.HOLE)
}

export function set_ref(memory: Memory, root: Root, reference: number) {
  write_tag(memory, root, TAGS.REF, reference)
}

export function get_ref(memory: Memory, root: Root) {
  if (tag_of(memory, root) !== TAGS.REF)
    throw new TypeError("Expected a heap reference")
  return memory.roots_view.getUint32(root * 8, true)
}

export function write_string(memory: Memory, root: Root, text: string) {
  assert_root(memory, root)
  if (typeof text !== "string") throw new TypeError("Expected a host string")
  const reference = allocate(memory, KINDS.STRING, 4 + text.length * 2)
  set_ref(memory, root, reference)
  write_u32(memory, reference + 8, text.length)
  for (let index = 0; index < text.length; index++) {
    memory.heap_view.setUint16(
      reference + 12 + index * 2,
      text.charCodeAt(index),
      true,
    )
  }
}

export function read_string(memory: Memory, root: Root) {
  const reference = get_ref(memory, root)
  if (read_u32(memory, reference) !== KINDS.STRING)
    throw new TypeError("Expected a string value")
  const length = read_u32(memory, reference + 8)
  let text = ""
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(
      memory.heap_view.getUint16(reference + 12 + index * 2, true),
    )
  }
  return text
}

export function string_length(memory: Memory, value: Root) {
  return heap_string_length(memory, get_ref(memory, value))
}

/** Heap references are temporary; these accessors never allocate. */
export function heap_string_length(memory: Memory, reference: HeapRef) {
  if (read_u32(memory, reference) !== KINDS.STRING)
    throw new TypeError("Expected a string")
  return read_u32(memory, reference + 8)
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
    throw new RangeError("Invalid string index")
  return memory.heap_view.getUint16(reference + 12 + index * 2, true)
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
    throw new RangeError("Invalid string range")
  const reference = allocate(memory, KINDS.STRING, 4 + (end - start) * 2)
  // Allocation may move the source; read its root afterwards, before replacing
  // an aliased destination. copyWithin also handles overlapping storage safely.
  const source = get_ref(memory, value) + 12 + start * 2
  memory.heap.copyWithin(reference + 12, source, source + (end - start) * 2)
  write_u32(memory, reference + 8, end - start)
  set_ref(memory, destination, reference)
}

export const WELL_KNOWN_SYMBOLS = Object.freeze([
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
])

export function create_symbol(
  memory: Memory,
  destination: Root,
  description?: Root,
) {
  const reference = allocate(memory, KINDS.SYMBOL, 8)
  // Copy before writing the destination, which may alias the description.
  if (description !== undefined)
    copy_root_to_heap_value(memory, reference + 8, description)
  set_ref(memory, destination, reference)
}

export function load_symbol_description(
  memory: Memory,
  destination: Root,
  symbol: Root,
) {
  const reference = get_ref(memory, symbol)
  if (read_u32(memory, reference) !== KINDS.SYMBOL)
    throw new TypeError("Expected a symbol")
  copy_heap_value_to_root(memory, destination, reference + 8)
}
