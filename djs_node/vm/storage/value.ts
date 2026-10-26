import type { Brand } from "../../utils.ts"
import { panic } from "../../utils.ts"
import type { Memory } from "./memory.ts"
import { HEADER } from "./layout.ts"

/** Byte offset into the heap; invalidated when garbage collection moves records. */
export type HeapRef = number

/** Index into the root table. Roots survive a moving garbage collection. */
export type Root = Brand<number, "Root">

// Every guest value is an eight-byte, little-endian slot: a binary64 number,
// or a NaN whose high word carries one of these tags.
export const VALUE_BYTES = 8
export const NAN_HIGH = 0x7ff80000
export const TAGS = Object.freeze({
  NUMBER: 0,
  UNDEFINED: 1,
  NULL: 2,
  BOOLEAN: 3,
  REF: 4,
  UNINITIALIZED: 5,
  HOLE: 6,
})

function write_tag(
  memory: Memory,
  root: Root,
  tag: number,
  payload: number = 0,
) {
  memory.assert_root(root)
  memory.roots_view.setUint32(root * VALUE_BYTES, payload, true)
  memory.roots_view.setUint32(root * VALUE_BYTES + 4, NAN_HIGH | tag, true)
}

export function tag_of(memory: Memory, root: Root) {
  memory.assert_root(root)
  const high = memory.roots_view.getUint32(root * VALUE_BYTES + 4, true)
  const tag = high - NAN_HIGH
  return tag > 0 && tag <= TAGS.HOLE ? tag : TAGS.NUMBER
}

/** The heap kind of a reference value, or 0 for any other value. */
export function kind_of(memory: Memory, value: Root) {
  return tag_of(memory, value) === TAGS.REF
    ? memory.read_u32(get_ref(memory, value) + HEADER.KIND)
    : 0
}

export function write_number(memory: Memory, root: Root, value: number) {
  memory.assert_root(root)
  if (typeof value !== "number") panic("Expected a host number")
  if (Number.isNaN(value)) {
    memory.roots_view.setUint32(root * VALUE_BYTES, 0, true)
    memory.roots_view.setUint32(root * VALUE_BYTES + 4, NAN_HIGH, true)
  } else {
    memory.roots_view.setFloat64(root * VALUE_BYTES, value, true)
  }
}

export function read_number(memory: Memory, root: Root) {
  if (tag_of(memory, root) !== TAGS.NUMBER) panic("Expected a numeric value")
  return memory.roots_view.getFloat64(root * VALUE_BYTES, true)
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
  if (tag_of(memory, root) !== TAGS.BOOLEAN) panic("Expected a boolean value")
  return memory.roots_view.getUint32(root * VALUE_BYTES, true) !== 0
}

export function write_uninitialized(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.UNINITIALIZED)
}

export function write_hole(memory: Memory, root: Root) {
  write_tag(memory, root, TAGS.HOLE)
}

export function set_ref(memory: Memory, root: Root, reference: HeapRef) {
  write_tag(memory, root, TAGS.REF, reference)
}

export function get_ref(memory: Memory, root: Root): HeapRef {
  if (tag_of(memory, root) !== TAGS.REF) panic("Expected a heap reference")
  return memory.roots_view.getUint32(root * VALUE_BYTES, true)
}

export function is_nullish(memory: Memory, value: Root) {
  const tag = tag_of(memory, value)
  return tag === TAGS.NULL || tag === TAGS.UNDEFINED
}
