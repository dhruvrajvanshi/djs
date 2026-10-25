import type { Memory } from "./memory.ts"
import {
  KINDS,
  memory_semispace_bytes,
  memory_active_start,
  memory_allocation_cursor,
  memory_set_allocation_cursor,
  memory_record_allocation,
  memory_finish_collection,
  memory_collections,
  memory_allocations,
  memory_root_count,
  memory_relocate_roots,
  relocate_heap_value,
  read_u32,
  write_u32,
  write_heap_undefined,
} from "./memory.ts"

export { KINDS } from "./memory.ts"
const FORWARDED = 0xffffffff
const MIN_PAYLOAD_BYTES: Readonly<Record<number, number>> = Object.freeze({
  [KINDS.STRING]: 4,
  [KINDS.OBJECT]: 8,
  [KINDS.PROPERTY]: 24,
  [KINDS.FUNCTION]: 48,
  [KINDS.ENVIRONMENT]: 16,
  [KINDS.BYTE_BUFFER]: 4,
  [KINDS.ERROR]: 8,
  [KINDS.ARRAY]: 16,
  [KINDS.BUILTIN_OBJECT]: 16,
  [KINDS.INTERNAL_METHODS]: 32,
  [KINDS.STRING_OBJECT]: 24,
  [KINDS.VALUE_ARRAY]: 8,
  [KINDS.SYMBOL]: 8,
})

export function allocate(memory: Memory, kind: number, payload_bytes: number) {
  if (!(Object.values(KINDS) as number[]).includes(kind)) {
    throw new RangeError(`Unknown heap kind: ${kind}`)
  }
  if (
    !Number.isSafeInteger(payload_bytes) ||
    payload_bytes < MIN_PAYLOAD_BYTES[kind]
  ) {
    throw new RangeError("Invalid heap payload size")
  }
  const size = Math.ceil((8 + payload_bytes) / 8) * 8
  const semispace_bytes = memory_semispace_bytes(memory)
  if (size > semispace_bytes) throw new RangeError("VM heap out of memory")
  let cursor = memory_allocation_cursor(memory)
  if (cursor + size > memory_active_start(memory) + semispace_bytes) {
    collect(memory)
    cursor = memory_allocation_cursor(memory)
    if (cursor + size > memory_active_start(memory) + semispace_bytes) {
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
    write_heap_undefined(memory, cursor + 48)
  } else if (kind === KINDS.INTERNAL_METHODS) {
    for (const offset of [8, 16, 24])
      write_heap_undefined(memory, cursor + offset)
  } else if (kind === KINDS.STRING_OBJECT) {
    write_heap_undefined(memory, cursor + 16)
  } else if (kind === KINDS.ENVIRONMENT || kind === KINDS.SYMBOL) {
    write_heap_undefined(memory, cursor + 8)
  }
  if (kind === KINDS.ENVIRONMENT || kind === KINDS.VALUE_ARRAY) {
    const values_start = kind === KINDS.ENVIRONMENT ? 24 : 16
    for (let offset = values_start; offset + 8 <= size; offset += 8) {
      write_heap_undefined(memory, cursor + offset)
    }
  }
  memory_set_allocation_cursor(memory, cursor + size)
  memory_record_allocation(memory)
  return cursor
}

// Cheney collection uses forwarding headers in from-space and a scan cursor in
// to-space. No host collection retains guest references across allocations.
export function collect(memory: Memory) {
  const semispace_bytes = memory_semispace_bytes(memory)
  const from_start = memory_active_start(memory)
  const from_end = memory_allocation_cursor(memory)
  const to_start = from_start === 8 ? 8 + semispace_bytes : 8
  let to_cursor = to_start

  function copy_reference(reference: number) {
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

  function trace_value(offset: number) {
    relocate_heap_value(memory, offset, copy_reference)
  }

  function trace_raw(offset: number) {
    write_u32(memory, offset, copy_reference(read_u32(memory, offset)))
  }

  memory_relocate_roots(memory, copy_reference)
  let scan = to_start
  while (scan < to_cursor) {
    const kind = read_u32(memory, scan)
    const size = read_u32(memory, scan + 4)
    if (
      (
        [
          KINDS.OBJECT,
          KINDS.ERROR,
          KINDS.ARRAY,
          KINDS.STRING_OBJECT,
          KINDS.BUILTIN_OBJECT,
        ] as number[]
      ).includes(kind)
    ) {
      trace_raw(scan + 8)
      trace_raw(scan + 12)
      if (kind === KINDS.STRING_OBJECT) {
        trace_value(scan + 16)
        trace_raw(scan + 24)
      }
      if (kind === KINDS.ARRAY || kind === KINDS.BUILTIN_OBJECT)
        trace_raw(scan + 16)
    } else if (kind === KINDS.INTERNAL_METHODS) {
      for (const offset of [8, 16, 24]) trace_value(scan + offset)
    } else if (kind === KINDS.PROPERTY) {
      trace_raw(scan + 8)
      trace_value(scan + 16)
      trace_value(scan + 24)
      if (size >= 40) trace_value(scan + 32)
    } else if (kind === KINDS.FUNCTION) {
      trace_value(scan + 16)
      trace_raw(scan + 24)
      trace_raw(scan + 28)
      trace_raw(scan + 36)
      trace_value(scan + 40)
      trace_value(scan + 48)
    } else if (kind === KINDS.SYMBOL) {
      trace_value(scan + 8)
    } else if (kind === KINDS.ENVIRONMENT || kind === KINDS.VALUE_ARRAY) {
      const environment = kind === KINDS.ENVIRONMENT
      if (environment) trace_value(scan + 8)
      const count = read_u32(memory, scan + (environment ? 16 : 8))
      const values_start = scan + (environment ? 24 : 16)
      if (values_start + count * 8 > scan + size)
        throw new Error("Invalid heap value array length")
      for (let index = 0; index < count; index++) {
        trace_value(values_start + index * 8)
      }
    } else if (kind !== KINDS.STRING && kind !== KINDS.BYTE_BUFFER) {
      throw new Error(`Unknown heap kind: ${kind}`)
    }
    scan += size
  }
  memory_finish_collection(memory, to_start, to_cursor)
}

export function heap_stats(memory: Memory) {
  return {
    used_bytes: memory_allocation_cursor(memory) - memory_active_start(memory),
    semispace_bytes: memory_semispace_bytes(memory),
    collections: memory_collections(memory),
    allocations: memory_allocations(memory),
    roots: memory_root_count(memory),
  }
}
