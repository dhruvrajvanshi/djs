import {
  CONTROL,
  KINDS,
  NAN_HIGH,
  TAGS,
  read_control,
  write_control,
  read_u32,
  write_u32,
  write_heap_undefined,
} from "./memory.js"

export { KINDS } from "./memory.js"
const FORWARDED = 0xffffffff
const MIN_PAYLOAD_BYTES = Object.freeze({
  [KINDS.STRING]: 4,
  [KINDS.OBJECT]: 8,
  [KINDS.PROPERTY]: 24,
  [KINDS.FUNCTION]: 48,
  [KINDS.ENVIRONMENT]: 16,
  [KINDS.ERROR]: 8,
  [KINDS.VALUE_ARRAY]: 8,
})

export function allocate(memory, kind, payload_bytes) {
  if (!Object.values(KINDS).includes(kind)) {
    throw new RangeError(`Unknown heap kind: ${kind}`)
  }
  if (
    !Number.isSafeInteger(payload_bytes) ||
    payload_bytes < MIN_PAYLOAD_BYTES[kind]
  ) {
    throw new RangeError("Invalid heap payload size")
  }
  const size = Math.ceil((8 + payload_bytes) / 8) * 8
  const semispace_bytes = read_control(memory, CONTROL.SEMISPACE_BYTES)
  if (size > semispace_bytes) throw new RangeError("VM heap out of memory")
  let cursor = read_control(memory, CONTROL.ALLOC_CURSOR)
  if (
    cursor + size >
    read_control(memory, CONTROL.ACTIVE_START) + semispace_bytes
  ) {
    collect(memory)
    cursor = read_control(memory, CONTROL.ALLOC_CURSOR)
    if (
      cursor + size >
      read_control(memory, CONTROL.ACTIVE_START) + semispace_bytes
    ) {
      throw new RangeError("VM heap out of memory")
    }
  }
  memory.heap.fill(0, cursor, cursor + size)
  write_u32(memory, cursor, kind)
  write_u32(memory, cursor + 4, size)
  // Empty reference-bearing fields must contain valid values even if a caller
  // allocates another record before filling all of this record's fields.
  if (kind === KINDS.PROPERTY) {
    write_heap_undefined(memory, cursor + 16)
    write_heap_undefined(memory, cursor + 24)
    if (size >= 40) write_heap_undefined(memory, cursor + 32)
  } else if (kind === KINDS.FUNCTION) {
    write_heap_undefined(memory, cursor + 16)
    write_heap_undefined(memory, cursor + 40)
  } else if (kind === KINDS.ENVIRONMENT) {
    write_heap_undefined(memory, cursor + 8)
  }
  if (kind === KINDS.ENVIRONMENT || kind === KINDS.VALUE_ARRAY) {
    const values_start = kind === KINDS.ENVIRONMENT ? 24 : 16
    for (let offset = values_start; offset + 8 <= size; offset += 8) {
      write_heap_undefined(memory, cursor + offset)
    }
  }
  write_control(memory, CONTROL.ALLOC_CURSOR, cursor + size)
  write_control(
    memory,
    CONTROL.ALLOCATIONS,
    read_control(memory, CONTROL.ALLOCATIONS) + 1,
  )
  return cursor
}

// Cheney collection uses forwarding headers in from-space and a scan cursor in
// to-space. No host collection retains guest references across allocations.
export function collect(memory) {
  const semispace_bytes = read_control(memory, CONTROL.SEMISPACE_BYTES)
  const from_start = read_control(memory, CONTROL.ACTIVE_START)
  const from_end = read_control(memory, CONTROL.ALLOC_CURSOR)
  const to_start = from_start === 8 ? 8 + semispace_bytes : 8
  let to_cursor = to_start

  function copy_reference(reference) {
    if (reference === 0) return 0
    if (
      reference < from_start ||
      reference >= from_end ||
      reference % 8 !== 0
    ) {
      throw new Error(`Invalid heap reference: ${reference}`)
    }
    const kind = read_u32(memory, reference)
    if (kind === FORWARDED) return read_u32(memory, reference + 4)
    const size = read_u32(memory, reference + 4)
    if (size < 8 || size % 8 !== 0 || reference + size > from_end) {
      throw new Error("Invalid heap record size")
    }
    const destination = to_cursor
    to_cursor += size
    if (to_cursor > to_start + semispace_bytes)
      throw new RangeError("VM heap out of memory")
    memory.heap.copyWithin(destination, reference, reference + size)
    write_u32(memory, reference, FORWARDED)
    write_u32(memory, reference + 4, destination)
    return destination
  }

  function trace_value(view, offset) {
    if (view.getUint32(offset + 4, true) === (NAN_HIGH | TAGS.REF)) {
      view.setUint32(offset, copy_reference(view.getUint32(offset, true)), true)
    }
  }

  function trace_raw(offset) {
    write_u32(memory, offset, copy_reference(read_u32(memory, offset)))
  }

  for (let root = 0; root < memory.root_used.length; root++) {
    if (memory.root_used[root] === 1) trace_value(memory.roots_view, root * 8)
  }
  let scan = to_start
  while (scan < to_cursor) {
    const kind = read_u32(memory, scan)
    const size = read_u32(memory, scan + 4)
    if (kind === KINDS.OBJECT || kind === KINDS.ERROR) {
      trace_raw(scan + 8)
      trace_raw(scan + 12)
    } else if (kind === KINDS.PROPERTY) {
      trace_raw(scan + 8)
      trace_value(memory.heap_view, scan + 16)
      trace_value(memory.heap_view, scan + 24)
      if (size >= 40) trace_value(memory.heap_view, scan + 32)
    } else if (kind === KINDS.FUNCTION) {
      trace_value(memory.heap_view, scan + 16)
      trace_raw(scan + 24)
      trace_raw(scan + 28)
      trace_value(memory.heap_view, scan + 40)
    } else if (kind === KINDS.ENVIRONMENT || kind === KINDS.VALUE_ARRAY) {
      const environment = kind === KINDS.ENVIRONMENT
      if (environment) trace_value(memory.heap_view, scan + 8)
      const count = read_u32(memory, scan + (environment ? 16 : 8))
      const values_start = scan + (environment ? 24 : 16)
      if (values_start + count * 8 > scan + size)
        throw new Error("Invalid heap value array length")
      for (let index = 0; index < count; index++) {
        trace_value(memory.heap_view, values_start + index * 8)
      }
    } else if (kind !== KINDS.STRING) {
      throw new Error(`Unknown heap kind: ${kind}`)
    }
    scan += size
  }
  write_control(memory, CONTROL.ACTIVE_START, to_start)
  write_control(memory, CONTROL.ALLOC_CURSOR, to_cursor)
  write_control(
    memory,
    CONTROL.COLLECTIONS,
    read_control(memory, CONTROL.COLLECTIONS) + 1,
  )
}

export function heap_stats(memory) {
  return {
    used_bytes:
      read_control(memory, CONTROL.ALLOC_CURSOR) -
      read_control(memory, CONTROL.ACTIVE_START),
    semispace_bytes: read_control(memory, CONTROL.SEMISPACE_BYTES),
    collections: read_control(memory, CONTROL.COLLECTIONS),
    allocations: read_control(memory, CONTROL.ALLOCATIONS),
    roots: read_control(memory, CONTROL.ROOT_COUNT),
  }
}
