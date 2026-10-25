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
})
export const CONTROL = Object.freeze({
  SEMISPACE_BYTES: 0,
  ACTIVE_START: 4,
  ALLOC_CURSOR: 8,
  ROOT_CAPACITY: 12,
  ROOT_COUNT: 16,
  COLLECTIONS: 20,
  ALLOCATIONS: 24,
})

function data_view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function create_memory({
  semispace_bytes = 1024 * 1024,
  root_capacity = 64,
} = {}) {
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

export function read_control(memory, field) {
  return memory.control_view.getUint32(field, true)
}

export function write_control(memory, field, value) {
  memory.control_view.setUint32(field, value, true)
}

export function assert_root(memory, root) {
  if (!Number.isInteger(root) || root < 0 || memory.root_used[root] !== 1) {
    throw new RangeError(`Invalid root handle: ${root}`)
  }
}

export function alloc_root(memory) {
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
  return root
}

export function free_root(memory, root) {
  assert_root(memory, root)
  memory.roots.fill(0, root * VALUE_BYTES, (root + 1) * VALUE_BYTES)
  memory.root_used[root] = 0
  write_control(
    memory,
    CONTROL.ROOT_COUNT,
    read_control(memory, CONTROL.ROOT_COUNT) - 1,
  )
}

export function copy_value(memory, destination, source) {
  assert_root(memory, destination)
  assert_root(memory, source)
  memory.roots.copyWithin(
    destination * VALUE_BYTES,
    source * VALUE_BYTES,
    (source + 1) * VALUE_BYTES,
  )
}

export function read_u32(memory, offset) {
  return memory.heap_view.getUint32(offset, true)
}

export function write_u32(memory, offset, value) {
  memory.heap_view.setUint32(offset, value, true)
}

export function copy_heap_value_to_root(memory, root, offset) {
  assert_root(memory, root)
  memory.roots.set(
    memory.heap.subarray(offset, offset + VALUE_BYTES),
    root * VALUE_BYTES,
  )
}

export function copy_root_to_heap_value(memory, offset, root) {
  assert_root(memory, root)
  memory.heap.set(
    memory.roots.subarray(root * VALUE_BYTES, (root + 1) * VALUE_BYTES),
    offset,
  )
}

export function write_heap_undefined(memory, offset) {
  write_u32(memory, offset, 0)
  write_u32(memory, offset + 4, NAN_HIGH | TAGS.UNDEFINED)
}
