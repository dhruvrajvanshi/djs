import { panic } from "../../utils.ts"
import type { JSValue, Heap } from "./heap.ts"
import { assert_live } from "./heap.ts"
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
  /**
   * Used to track variables which are lexically visible to a closure,
   * but haven't been initialized because the closure was called before the
   * variable's declaration.
   *
   * @example
   * ```js
   * foo(); // foo visible because of hoisting
   * let x; // declared after foo is called.
   * function foo() { console.log(x) }
   * ```
   *
   * Every variable that a closure captures starts with this tag.
   *
   * Another place where this happens is referring to `this` before calling super
   * in a derived class.
   */
  UNINITIALIZED: 5,
})

function write_tag(
  heap: Heap,
  handle: JSValue,
  tag: number,
  payload: number = 0,
) {
  assert_live(handle)
  handle.space.view.setUint32(handle.index * VALUE_BYTES, payload, true)
  handle.space.view.setUint32(
    handle.index * VALUE_BYTES + 4,
    NAN_HIGH | tag,
    true,
  )
}

export function tag_of(heap: Heap, handle: JSValue) {
  assert_live(handle)
  const high = handle.space.view.getUint32(handle.index * VALUE_BYTES + 4, true)
  const tag = high - NAN_HIGH
  return tag > 0 && tag <= VALUE_TAGS.UNINITIALIZED ? tag : VALUE_TAGS.NUMBER
}

/** The heap type of a reference value, or 0 for any other value. */
export function heap_type_of(heap: Heap, value: JSValue) {
  return tag_of(heap, value) === VALUE_TAGS.REF
    ? heap.read_u32(get_ref(heap, value) + HEADER.TYPE)
    : 0
}

export function write_number(heap: Heap, dest: JSValue, value: number) {
  assert_live(dest)
  if (typeof value !== "number") panic("Expected a host number")
  if (Number.isNaN(value)) {
    dest.space.view.setUint32(dest.index * VALUE_BYTES, 0, true)
    dest.space.view.setUint32(dest.index * VALUE_BYTES + 4, NAN_HIGH, true)
  } else {
    dest.space.view.setFloat64(dest.index * VALUE_BYTES, value, true)
  }
}

export function read_number(heap: Heap, handle: JSValue) {
  if (tag_of(heap, handle) !== VALUE_TAGS.NUMBER)
    panic("Expected a numeric value")
  return handle.space.view.getFloat64(handle.index * VALUE_BYTES, true)
}

export function write_undefined(heap: Heap, dest: JSValue) {
  write_tag(heap, dest, VALUE_TAGS.UNDEFINED)
}

export function write_null(heap: Heap, dest: JSValue) {
  write_tag(heap, dest, VALUE_TAGS.NULL)
}

export function write_boolean(heap: Heap, dest: JSValue, value: boolean) {
  write_tag(heap, dest, VALUE_TAGS.BOOLEAN, value ? 1 : 0)
}

export function read_boolean(heap: Heap, handle: JSValue) {
  if (tag_of(heap, handle) !== VALUE_TAGS.BOOLEAN)
    panic("Expected a boolean value")
  return handle.space.view.getUint32(handle.index * VALUE_BYTES, true) !== 0
}

export function write_uninitialized(heap: Heap, dest: JSValue) {
  write_tag(heap, dest, VALUE_TAGS.UNINITIALIZED)
}

export function set_ref(heap: Heap, handle: JSValue, reference: Address) {
  write_tag(heap, handle, VALUE_TAGS.REF, reference)
}

export function get_ref(heap: Heap, handle: JSValue): Address {
  if (tag_of(heap, handle) !== VALUE_TAGS.REF)
    panic("Expected a heap reference")
  return handle.space.view.getUint32(handle.index * VALUE_BYTES, true)
}

export function is_nullish(heap: Heap, value: JSValue) {
  const tag = tag_of(heap, value)
  return tag === VALUE_TAGS.NULL || tag === VALUE_TAGS.UNDEFINED
}
