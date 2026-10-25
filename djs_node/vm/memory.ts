import type { Brand } from "../utils.ts"
import { panic } from "../utils.ts"

/** Byte offset into the heap; invalidated when garbage collection moves records. */
export type HeapRef = number

// Every guest value is an eight-byte, little-endian slot.
export const VALUE_BYTES = 8
export const NULL_REF = 0
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
export const KINDS = Object.freeze({
  STRING: 1,
  OBJECT: 2,
  PROPERTY: 3,
  FUNCTION: 4,
  ENVIRONMENT: 5,
  BYTE_BUFFER: 6,
  VALUE_ARRAY: 7,
  ERROR: 8,
  ARRAY: 9,
  STRING_OBJECT: 10,
  SYMBOL: 13,
})
export interface MemoryOptions {
  semispace_bytes?: number
  root_capacity?: number
}

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export class Memory {
  heap: Uint8Array
  heap_view: DataView
  roots: Uint8Array
  roots_view: DataView
  root_used: Uint8Array
  readonly semispace_bytes: number
  active_start = 8
  allocation_cursor = 8
  root_count = 0
  collections = 0
  allocations = 0
  object_prototype?: Root
  function_prototype?: Root
  array_prototype?: Root
  string_prototype?: Root
  symbol_prototype?: Root

  constructor({
    semispace_bytes = 1024 * 1024,
    root_capacity = 64,
  }: MemoryOptions = {}) {
    if (
      !Number.isSafeInteger(semispace_bytes) ||
      semispace_bytes < 32 ||
      semispace_bytes % 8 !== 0 ||
      semispace_bytes > 0x7ffffff8
    ) {
      throw new RangeError(
        "semispace_bytes must be an aligned size below 2 GiB",
      )
    }
    if (!Number.isSafeInteger(root_capacity) || root_capacity < 1) {
      throw new RangeError("root_capacity must be a positive integer")
    }
    this.semispace_bytes = semispace_bytes
    this.heap = new Uint8Array(8 + semispace_bytes * 2)
    this.heap_view = data_view(this.heap)
    this.roots = new Uint8Array(root_capacity * VALUE_BYTES)
    this.roots_view = data_view(this.roots)
    this.root_used = new Uint8Array(root_capacity)
  }

  finish_collection(start: number, cursor: number) {
    this.active_start = start
    this.allocation_cursor = cursor
    this.collections++
  }

  assert_root(root: number): asserts root is Root {
    if (!Number.isInteger(root) || root < 0 || this.root_used[root] !== 1) {
      panic(`Invalid root handle: ${root}`)
    }
  }

  alloc_root(): Root {
    let root = this.root_used.indexOf(0)
    if (root === -1) {
      root = this.root_used.length
      const roots = new Uint8Array(this.roots.length * 2)
      roots.set(this.roots)
      const root_used = new Uint8Array(this.root_used.length * 2)
      root_used.set(this.root_used)
      this.roots = roots
      this.roots_view = data_view(roots)
      this.root_used = root_used
    }
    this.root_used[root] = 1
    this.roots_view.setUint32(root * VALUE_BYTES, 0, true)
    this.roots_view.setUint32(
      root * VALUE_BYTES + 4,
      NAN_HIGH | TAGS.UNDEFINED,
      true,
    )
    this.root_count++
    return root as Root
  }

  free_root(root: Root) {
    this.assert_root(root)
    this.roots.fill(0, root * VALUE_BYTES, (root + 1) * VALUE_BYTES)
    this.root_used[root] = 0
    this.root_count--
  }

  copy_value(destination: Root, source: Root) {
    this.assert_root(destination)
    this.assert_root(source)
    this.roots.copyWithin(
      destination * VALUE_BYTES,
      source * VALUE_BYTES,
      (source + 1) * VALUE_BYTES,
    )
  }

  copy_heap_value_to_root(root: Root, offset: number) {
    this.assert_root(root)
    this.roots.set(
      this.heap.subarray(offset, offset + VALUE_BYTES),
      root * VALUE_BYTES,
    )
  }

  copy_root_to_heap_value(offset: number, root: Root) {
    this.assert_root(root)
    this.heap.set(
      this.roots.subarray(root * VALUE_BYTES, (root + 1) * VALUE_BYTES),
      offset,
    )
  }

  relocate_roots(relocate: (reference: HeapRef) => HeapRef) {
    for (let root = 0; root < this.root_used.length; root++) {
      if (this.root_used[root] === 1)
        relocate_value(this.roots_view, root * VALUE_BYTES, relocate)
    }
  }

  relocate_heap_value(
    offset: number,
    relocate: (reference: HeapRef) => HeapRef,
  ) {
    relocate_value(this.heap_view, offset, relocate)
  }

  read_u32(offset: number) {
    return this.heap_view.getUint32(offset, true)
  }

  write_u32(offset: number, value: number) {
    this.heap_view.setUint32(offset, value, true)
  }

  write_heap_undefined(offset: number) {
    this.write_u32(offset, 0)
    this.write_u32(offset + 4, NAN_HIGH | TAGS.UNDEFINED)
  }
}

/** Index into the root table. Roots survive a moving garbage collection. */
export type Root = Brand<number, "Root">

/** Decode a root handle stored in a host-side packed record. */
export function read_root(view: DataView, offset: number): Root {
  return view.getUint32(offset, true) as Root
}

/** Optional packed handles use the all-ones sentinel rather than a root index. */
export function read_optional_root(
  view: DataView,
  offset: number,
): Root | null {
  const root = view.getUint32(offset, true)
  return root === 0xffffffff ? null : (root as Root)
}

/** Rewrite only reference payloads, preserving the value's tag and other bits. */
function relocate_value(
  view: DataView,
  offset: number,
  relocate: (reference: HeapRef) => HeapRef,
) {
  if (view.getUint32(offset + 4, true) === (NAN_HIGH | TAGS.REF)) {
    view.setUint32(offset, relocate(view.getUint32(offset, true)), true)
  }
}
