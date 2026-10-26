import { panic } from "../../utils.ts"
import type { HeapRef, Root } from "./value.ts"
import { NAN_HIGH, TAGS, VALUE_BYTES } from "./value.ts"
import { HEADER, LAYOUTS } from "./layout.ts"

const FORWARDED = 0xffffffff

const SEMISPACE_BYTES = 1024 * 1024
const INITIAL_ROOT_CAPACITY = 64

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
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

/**
 * A two-semispace copying heap plus a table of roots. Records are laid out as
 * described in layout.ts; Memory knows nothing about their JS meaning.
 */
export class Memory {
  heap: Uint8Array
  heap_view: DataView
  roots: Uint8Array
  roots_view: DataView
  root_used: Uint8Array
  readonly semispace_bytes = SEMISPACE_BYTES
  active_start = 8
  allocation_cursor = 8

  constructor() {
    this.heap = new Uint8Array(8 + this.semispace_bytes * 2)
    this.heap_view = data_view(this.heap)
    this.roots = new Uint8Array(INITIAL_ROOT_CAPACITY * VALUE_BYTES)
    this.roots_view = data_view(this.roots)
    this.root_used = new Uint8Array(INITIAL_ROOT_CAPACITY)
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
    return root as Root
  }

  free_root(root: Root) {
    this.assert_root(root)
    this.roots.fill(0, root * VALUE_BYTES, (root + 1) * VALUE_BYTES)
    this.root_used[root] = 0
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

  allocate(kind: number, payload_bytes: number): HeapRef {
    const layout = LAYOUTS[kind]
    if (layout === undefined) panic(`Unknown heap kind: ${kind}`)
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
    this.heap.fill(0, cursor, cursor + size)
    this.write_u32(cursor + HEADER.KIND, kind)
    this.write_u32(cursor + HEADER.SIZE, size)
    // Value fields must hold valid values even if a caller allocates another
    // record before filling all of this record's fields.
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

    const copy_reference = (reference: HeapRef) => {
      if (reference === 0) return 0
      if (
        reference < from_start ||
        reference >= from_end ||
        reference % 8 !== 0
      ) {
        panic(`Invalid heap reference: ${reference}`)
      }
      const kind = this.read_u32(reference + HEADER.KIND)
      if (kind === FORWARDED) return this.read_u32(reference + HEADER.SIZE)
      const size = this.read_u32(reference + HEADER.SIZE)
      if (size < 8 || size % 8 !== 0 || reference + size > from_end) {
        panic("Invalid heap record size")
      }
      const destination = to_cursor
      to_cursor += size
      if (to_cursor > to_start + this.semispace_bytes)
        panic("VM heap out of memory")
      this.heap.copyWithin(destination, reference, reference + size)
      this.write_u32(reference + HEADER.KIND, FORWARDED)
      this.write_u32(reference + HEADER.SIZE, destination)
      return destination
    }

    for (let root = 0; root < this.root_used.length; root++) {
      if (this.root_used[root] === 1)
        relocate_value(this.roots_view, root * VALUE_BYTES, copy_reference)
    }
    let scan = to_start
    while (scan < to_cursor) {
      const kind = this.read_u32(scan + HEADER.KIND)
      const size = this.read_u32(scan + HEADER.SIZE)
      const layout = LAYOUTS[kind]
      if (layout === undefined) panic(`Unknown heap kind: ${kind}`)
      for (const offset of layout.refs)
        this.write_u32(
          scan + offset,
          copy_reference(this.read_u32(scan + offset)),
        )
      for (const offset of layout.values)
        if (offset + VALUE_BYTES <= size)
          relocate_value(this.heap_view, scan + offset, copy_reference)
      if (layout.value_run) {
        const count = this.read_u32(scan + layout.value_run.count)
        const start = scan + layout.value_run.start
        if (start + count * VALUE_BYTES > scan + size)
          panic("Invalid heap value array length")
        for (let index = 0; index < count; index++)
          relocate_value(
            this.heap_view,
            start + index * VALUE_BYTES,
            copy_reference,
          )
      }
      scan += size
    }
    this.active_start = to_start
    this.allocation_cursor = to_cursor
  }
}
