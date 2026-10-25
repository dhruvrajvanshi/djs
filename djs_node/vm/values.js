import {
  KINDS,
  NAN_HIGH,
  TAGS,
  assert_root,
  read_u32,
  write_u32,
} from "./memory.js"
import { allocate } from "./heap.js"

export { TAGS, KINDS, copy_value } from "./memory.js"

function write_tag(memory, root, tag, payload = 0) {
  assert_root(memory, root)
  memory.roots_view.setUint32(root * 8, payload, true)
  memory.roots_view.setUint32(root * 8 + 4, NAN_HIGH | tag, true)
}

export function tag_of(memory, root) {
  assert_root(memory, root)
  const high = memory.roots_view.getUint32(root * 8 + 4, true)
  const tag = high - NAN_HIGH
  return tag > 0 && tag <= TAGS.HOLE ? tag : TAGS.NUMBER
}

export function write_number(memory, root, value) {
  assert_root(memory, root)
  if (typeof value !== "number") throw new TypeError("Expected a host number")
  if (Number.isNaN(value)) {
    memory.roots_view.setUint32(root * 8, 0, true)
    memory.roots_view.setUint32(root * 8 + 4, NAN_HIGH, true)
  } else {
    memory.roots_view.setFloat64(root * 8, value, true)
  }
}

export function read_number(memory, root) {
  if (tag_of(memory, root) !== TAGS.NUMBER)
    throw new TypeError("Expected a numeric value")
  return memory.roots_view.getFloat64(root * 8, true)
}

export function write_undefined(memory, root) {
  write_tag(memory, root, TAGS.UNDEFINED)
}

export function write_null(memory, root) {
  write_tag(memory, root, TAGS.NULL)
}

export function write_boolean(memory, root, value) {
  write_tag(memory, root, TAGS.BOOLEAN, value ? 1 : 0)
}

export function read_boolean(memory, root) {
  if (tag_of(memory, root) !== TAGS.BOOLEAN)
    throw new TypeError("Expected a boolean value")
  return memory.roots_view.getUint32(root * 8, true) !== 0
}

export function write_uninitialized(memory, root) {
  write_tag(memory, root, TAGS.UNINITIALIZED)
}

export function write_hole(memory, root) {
  write_tag(memory, root, TAGS.HOLE)
}

export function set_ref(memory, root, reference) {
  write_tag(memory, root, TAGS.REF, reference)
}

export function get_ref(memory, root) {
  if (tag_of(memory, root) !== TAGS.REF)
    throw new TypeError("Expected a heap reference")
  return memory.roots_view.getUint32(root * 8, true)
}

export function write_string(memory, root, text) {
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

export function read_string(memory, root) {
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

export function string_length(memory, value) {
  const reference = get_ref(memory, value)
  if (read_u32(memory, reference) !== KINDS.STRING)
    throw new TypeError("Expected a string")
  return read_u32(memory, reference + 8)
}

export function string_code_unit_at(memory, value, index) {
  const length = string_length(memory, value)
  if (!Number.isInteger(index) || index < 0 || index >= length)
    throw new RangeError("Invalid string index")
  return memory.heap_view.getUint16(
    get_ref(memory, value) + 12 + index * 2,
    true,
  )
}

export function slice_string(memory, destination, value, start, end) {
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
