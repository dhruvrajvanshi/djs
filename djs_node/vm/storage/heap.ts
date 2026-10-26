import { panic } from "../../utils.ts"
import type { Address, Handle } from "./value.ts"
import { NAN_HIGH, VALUE_TAGS, VALUE_BYTES } from "./value.ts"
import { HEADER, LAYOUTS } from "./layout.ts"
import { HandleTable } from "./handles.ts"

const FORWARDED = 0xffffffff

const SEMISPACE_BYTES = 1024 * 1024

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** Rewrite only reference payloads, preserving the value's tag and other bits. */
function relocate_value(
  view: DataView,
  offset: number,
  relocate: (reference: Address) => Address,
) {
  if (view.getUint32(offset + 4, true) === (NAN_HIGH | VALUE_TAGS.REF)) {
    view.setUint32(offset, relocate(view.getUint32(offset, true)), true)
  }
}

/**
 * A two-semispace copying heap and the handle table that roots it. Heap
 * objects are laid out as described in layout.ts; Heap knows nothing about
 * their JS meaning.
 */
export class Heap {
  bytes: Uint8Array
  view: DataView
  readonly handles: HandleTable = new HandleTable()
  readonly semispace_bytes = SEMISPACE_BYTES
  active_start = 8
  allocation_cursor = 8

  constructor() {
    this.bytes = new Uint8Array(8 + this.semispace_bytes * 2)
    this.view = data_view(this.bytes)
  }

  copy_value(destination: Handle, source: Handle) {
    this.handles.copy(destination, source)
  }

  /** Copies the value field at `address` into `handle`. */
  load_value(handle: Handle, address: Address) {
    this.handles.assert_handle(handle)
    this.handles.bytes.set(
      this.bytes.subarray(address, address + VALUE_BYTES),
      handle * VALUE_BYTES,
    )
  }

  /** Copies `handle`'s value into the value field at `address`. */
  store_value(address: Address, handle: Handle) {
    this.handles.assert_handle(handle)
    this.bytes.set(
      this.handles.bytes.subarray(
        handle * VALUE_BYTES,
        (handle + 1) * VALUE_BYTES,
      ),
      address,
    )
  }

  read_u32(offset: number) {
    return this.view.getUint32(offset, true)
  }

  write_u32(offset: number, value: number) {
    this.view.setUint32(offset, value, true)
  }

  write_heap_undefined(offset: number) {
    this.write_u32(offset, 0)
    this.write_u32(offset + 4, NAN_HIGH | VALUE_TAGS.UNDEFINED)
  }

  allocate(type: number, payload_bytes: number): Address {
    const layout = LAYOUTS[type]
    if (layout === undefined) panic(`Unknown heap type: ${type}`)
    if (
      !Number.isSafeInteger(payload_bytes) ||
      payload_bytes < layout.min_payload_bytes
    ) {
      panic("Invalid heap payload size")
    }
    const size = Math.ceil((HEADER.BYTES + payload_bytes) / 8) * 8
    if (size > this.semispace_bytes) panic("VM heap out of memory")
    if (
      this.allocation_cursor + size >
      this.active_start + this.semispace_bytes
    ) {
      this.collect()
      if (
        this.allocation_cursor + size >
        this.active_start + this.semispace_bytes
      ) {
        panic("VM heap out of memory")
      }
    }
    const cursor = this.allocation_cursor
    this.bytes.fill(0, cursor, cursor + size)
    this.write_u32(cursor + HEADER.TYPE, type)
    this.write_u32(cursor + HEADER.SIZE, size)
    // Value fields must hold valid values even if a caller allocates another
    // heap object before filling all of this one's fields.
    for (const offset of layout.values)
      if (offset + VALUE_BYTES <= size)
        this.write_heap_undefined(cursor + offset)
    if (layout.value_run)
      for (
        let offset = layout.value_run.start;
        offset + VALUE_BYTES <= size;
        offset += VALUE_BYTES
      )
        this.write_heap_undefined(cursor + offset)
    this.allocation_cursor = cursor + size
    return cursor
  }

  // Cheney collection uses forwarding headers in from-space and a scan cursor
  // in to-space. No host collection retains guest references across allocations.
  collect() {
    const from_start = this.active_start
    const from_end = this.allocation_cursor
    const to_start = from_start === 8 ? 8 + this.semispace_bytes : 8
    let to_cursor = to_start

    const copy_reference = (reference: Address) => {
      if (reference === 0) return 0
      if (
        reference < from_start ||
        reference >= from_end ||
        reference % 8 !== 0
      ) {
        panic(`Invalid heap reference: ${reference}`)
      }
      const type = this.read_u32(reference + HEADER.TYPE)
      if (type === FORWARDED) return this.read_u32(reference + HEADER.SIZE)
      const size = this.read_u32(reference + HEADER.SIZE)
      if (size < 8 || size % 8 !== 0 || reference + size > from_end) {
        panic("Invalid heap object size")
      }
      const destination = to_cursor
      to_cursor += size
      if (to_cursor > to_start + this.semispace_bytes)
        panic("VM heap out of memory")
      this.bytes.copyWithin(destination, reference, reference + size)
      this.write_u32(reference + HEADER.TYPE, FORWARDED)
      this.write_u32(reference + HEADER.SIZE, destination)
      return destination
    }

    this.handles.trace((view, offset) =>
      relocate_value(view, offset, copy_reference),
    )
    let scan = to_start
    while (scan < to_cursor) {
      const type = this.read_u32(scan + HEADER.TYPE)
      const size = this.read_u32(scan + HEADER.SIZE)
      const layout = LAYOUTS[type]
      if (layout === undefined) panic(`Unknown heap type: ${type}`)
      for (const offset of layout.refs)
        this.write_u32(
          scan + offset,
          copy_reference(this.read_u32(scan + offset)),
        )
      for (const offset of layout.values)
        if (offset + VALUE_BYTES <= size)
          relocate_value(this.view, scan + offset, copy_reference)
      if (layout.value_run) {
        const count = this.read_u32(scan + layout.value_run.count)
        const start = scan + layout.value_run.start
        if (start + count * VALUE_BYTES > scan + size)
          panic("Invalid heap value array length")
        for (let index = 0; index < count; index++)
          relocate_value(this.view, start + index * VALUE_BYTES, copy_reference)
      }
      scan += size
    }
    this.active_start = to_start
    this.allocation_cursor = to_cursor
  }
}
