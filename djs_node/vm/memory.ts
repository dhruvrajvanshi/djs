import type { Brand } from "../utils.ts"
import { panic } from "../utils.ts"

/** Byte offset into the heap; invalidated when garbage collection moves records. */
export type HeapRef = number

// Every guest value is an eight-byte, little-endian slot. Host objects contain
// storage views only; mutable VM counters live in control bytes.
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
  BUILTIN_OBJECT: 11,
  INTERNAL_METHODS: 12,
  SYMBOL: 13,
})
const CONTROL = Object.freeze({
  SEMISPACE_BYTES: 0,
  ACTIVE_START: 4,
  ALLOC_CURSOR: 8,
  ROOT_CAPACITY: 12,
  ROOT_COUNT: 16,
  COLLECTIONS: 20,
  ALLOCATIONS: 24,
})

export interface MemoryOptions {
  semispace_bytes?: number
  root_capacity?: number
}

export interface Memory {
  heap: Uint8Array
  heap_view: DataView
  roots: Uint8Array
  roots_view: DataView
  root_used: Uint8Array
  control: Uint8Array
  control_view: DataView
  object_prototype?: Root
  array_prototype?: Root
  string_prototype?: Root
  symbol_prototype?: Root
  array_class?: Root
  string_class?: Root
}

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function create_memory({
  semispace_bytes = 1024 * 1024,
  root_capacity = 64,
}: MemoryOptions = {}): Memory {
  if (
    !Number.isSafeInteger(semispace_bytes) ||
    semispace_bytes < 32 ||
    semispace_bytes % 8 !== 0 ||
    semispace_bytes > 0x7ffffff8
  ) {
    throw new RangeError("semispace_bytes must be an aligned size below 2 GiB")
  }
  if (!Number.isSafeInteger(root_capacity) || root_capacity < 1) {
    throw new RangeError("root_capacity must be a positive integer")
  }
  const heap = new Uint8Array(8 + semispace_bytes * 2)
  const roots = new Uint8Array(root_capacity * VALUE_BYTES)
  const control = new Uint8Array(64)
  const memory = {
    heap,
    heap_view: data_view(heap),
    roots,
    roots_view: data_view(roots),
    root_used: new Uint8Array(root_capacity),
    control,
    control_view: data_view(control),
  }
  write_control(memory, CONTROL.SEMISPACE_BYTES, semispace_bytes)
  write_control(memory, CONTROL.ACTIVE_START, 8)
  write_control(memory, CONTROL.ALLOC_CURSOR, 8)
  write_control(memory, CONTROL.ROOT_CAPACITY, root_capacity)
  return memory
}

function read_control(memory: Memory, field: number) {
  return memory.control_view.getUint32(field, true)
}

function write_control(memory: Memory, field: number, value: number) {
  memory.control_view.setUint32(field, value, true)
}

export function memory_semispace_bytes(memory: Memory): number {
  return read_control(memory, CONTROL.SEMISPACE_BYTES)
}

export function memory_active_start(memory: Memory): number {
  return read_control(memory, CONTROL.ACTIVE_START)
}

export function memory_allocation_cursor(memory: Memory): number {
  return read_control(memory, CONTROL.ALLOC_CURSOR)
}

export function memory_set_allocation_cursor(memory: Memory, cursor: number) {
  write_control(memory, CONTROL.ALLOC_CURSOR, cursor)
}

export function memory_record_allocation(memory: Memory) {
  write_control(memory, CONTROL.ALLOCATIONS, memory_allocations(memory) + 1)
}

export function memory_finish_collection(
  memory: Memory,
  start: number,
  cursor: number,
) {
  write_control(memory, CONTROL.ACTIVE_START, start)
  write_control(memory, CONTROL.ALLOC_CURSOR, cursor)
  write_control(memory, CONTROL.COLLECTIONS, memory_collections(memory) + 1)
}

export function memory_collections(memory: Memory): number {
  return read_control(memory, CONTROL.COLLECTIONS)
}

export function memory_allocations(memory: Memory): number {
  return read_control(memory, CONTROL.ALLOCATIONS)
}

export function memory_root_count(memory: Memory): number {
  return read_control(memory, CONTROL.ROOT_COUNT)
}

/** Index into the root table. Roots survive a moving garbage collection. */
export type Root = Brand<number, "Root">

export function assert_root(
  memory: Memory,
  root: number,
): asserts root is Root {
  if (!Number.isInteger(root) || root < 0 || memory.root_used[root] !== 1) {
    panic(`Invalid root handle: ${root}`)
  }
}

export function alloc_root(memory: Memory): Root {
  let root = memory.root_used.indexOf(0)
  if (root === -1) {
    root = memory.root_used.length
    const roots = new Uint8Array(memory.roots.length * 2)
    roots.set(memory.roots)
    const root_used = new Uint8Array(memory.root_used.length * 2)
    root_used.set(memory.root_used)
    memory.roots = roots
    memory.roots_view = data_view(roots)
    memory.root_used = root_used
    write_control(memory, CONTROL.ROOT_CAPACITY, root_used.length)
  }
  memory.root_used[root] = 1
  memory.roots_view.setUint32(root * VALUE_BYTES, 0, true)
  memory.roots_view.setUint32(
    root * VALUE_BYTES + 4,
    NAN_HIGH | TAGS.UNDEFINED,
    true,
  )
  write_control(
    memory,
    CONTROL.ROOT_COUNT,
    read_control(memory, CONTROL.ROOT_COUNT) + 1,
  )
  return root as Root
}

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

export function free_root(memory: Memory, root: Root) {
  assert_root(memory, root)
  memory.roots.fill(0, root * VALUE_BYTES, (root + 1) * VALUE_BYTES)
  memory.root_used[root] = 0
  write_control(
    memory,
    CONTROL.ROOT_COUNT,
    read_control(memory, CONTROL.ROOT_COUNT) - 1,
  )
}

export function copy_value(memory: Memory, destination: Root, source: Root) {
  assert_root(memory, destination)
  assert_root(memory, source)
  memory.roots.copyWithin(
    destination * VALUE_BYTES,
    source * VALUE_BYTES,
    (source + 1) * VALUE_BYTES,
  )
}

export function copy_heap_value_to_root(
  memory: Memory,
  root: Root,
  offset: number,
) {
  assert_root(memory, root)
  memory.roots.set(
    memory.heap.subarray(offset, offset + VALUE_BYTES),
    root * VALUE_BYTES,
  )
}

export function copy_root_to_heap_value(
  memory: Memory,
  offset: number,
  root: Root,
) {
  assert_root(memory, root)
  memory.heap.set(
    memory.roots.subarray(root * VALUE_BYTES, (root + 1) * VALUE_BYTES),
    offset,
  )
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

export function memory_relocate_roots(
  memory: Memory,
  relocate: (reference: HeapRef) => HeapRef,
) {
  for (let root = 0; root < memory.root_used.length; root++) {
    if (memory.root_used[root] === 1)
      relocate_value(memory.roots_view, root * VALUE_BYTES, relocate)
  }
}

export function relocate_heap_value(
  memory: Memory,
  offset: number,
  relocate: (reference: HeapRef) => HeapRef,
) {
  relocate_value(memory.heap_view, offset, relocate)
}

export function read_u32(memory: Memory, offset: number) {
  return memory.heap_view.getUint32(offset, true)
}

export function write_u32(memory: Memory, offset: number, value: number) {
  memory.heap_view.setUint32(offset, value, true)
}

export function write_heap_undefined(memory: Memory, offset: number) {
  write_u32(memory, offset, 0)
  write_u32(memory, offset + 4, NAN_HIGH | TAGS.UNDEFINED)
}
