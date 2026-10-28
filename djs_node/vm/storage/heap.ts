import { panic, type Brand } from "../../utils.ts"
import type { Address } from "./value.ts"
import { NAN_HIGH, VALUE_TAGS, VALUE_BYTES } from "./value.ts"
import { HEADER, LAYOUTS, type HeapType } from "./layout.ts"

const FORWARDED = 0xffffffff

const SEMISPACE_BYTES = 1024 * 1024

/**
 * A handle is an index into a table of values managed by the heap.
 * It is required because when the VM wants to manipulate JS values, it needs
 * to notify the garbage collector somehow to keep these values alive.
 *
 * Handles are "re-pointed" automatically when a garbage collection moves
 * the underlying value in memory.
 *
 * @example
 * ```ts
 * heap.handles.scope(() => {
 *   const temp_value = heap.handles.local()
 *   // do stuff with temp_value.
 *   // ...
 *   // temp_value is released from the handle table when the scope ends.
 *   // it's no longer valid to use it after the scope ends.
 * })
 * ```
 */
export type Handle = Brand<number, "Handle">

/**
 * Like a {@link Handle}, but it is released explicitly using {@link HandleTable.release}.
 * Used for values that live for the whole program, or whose lifetime isn’t tied to a scope.
 */
export type Persistent = Handle & { readonly [lifetime]: "persistent" }

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

  load_value(handle: Handle, address: Address) {
    this.handles.assert_handle(handle)
    this.handles.bytes.set(
      this.bytes.subarray(address, address + VALUE_BYTES),
      handle * VALUE_BYTES,
    )
  }

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

  allocate(type: HeapType, payload_bytes: number): Address {
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
      const type = this.read_u32(scan + HEADER.TYPE) as HeapType
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

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function relocate_value(
  view: DataView,
  offset: number,
  relocate: (reference: Address) => Address,
) {
  if (view.getUint32(offset + 4, true) === (NAN_HIGH | VALUE_TAGS.REF)) {
    view.setUint32(offset, relocate(view.getUint32(offset, true)), true)
  }
}

class HandleTable {
  bytes: Uint8Array
  view: DataView
  in_use: Uint8Array
  /** Free slot indices, most recently released last. */
  private free: number[] = []
  /** Local handles of the open scopes, innermost last. */
  private locals: Handle[] = []
  private scope_starts: number[] = []

  constructor() {
    const INITIAL_CAPACITY = 64
    this.bytes = new Uint8Array(INITIAL_CAPACITY * VALUE_BYTES)
    this.view = data_view(this.bytes)
    this.in_use = new Uint8Array(INITIAL_CAPACITY)
    for (let index = INITIAL_CAPACITY - 1; index >= 0; index--)
      this.free.push(index)
  }

  assert_handle(handle: number): asserts handle is Handle {
    if (!Number.isInteger(handle) || handle < 0 || this.in_use[handle] !== 1) {
      panic(`Invalid handle: ${handle}`)
    }
  }

  scope<T>(body: () => T): T {
    this.scope_starts.push(this.locals.length)
    try {
      return body()
    } finally {
      const start = this.scope_starts.pop()!
      while (this.locals.length > start) this.free_slot(this.locals.pop()!)
    }
  }

  local(): Handle {
    if (this.scope_starts.length === 0) panic("No open handle scope")
    const handle = this.allocate()
    this.locals.push(handle)
    return handle
  }

  persistent(): Persistent {
    return this.allocate() as Persistent
  }

  release(handle: Persistent) {
    this.free_slot(handle)
  }

  copy(destination: Handle, source: Handle) {
    this.assert_handle(destination)
    this.assert_handle(source)
    this.bytes.copyWithin(
      destination * VALUE_BYTES,
      source * VALUE_BYTES,
      (source + 1) * VALUE_BYTES,
    )
  }

  trace(visit: (view: DataView, offset: number) => void) {
    for (let index = 0; index < this.in_use.length; index++)
      if (this.in_use[index] === 1) visit(this.view, index * VALUE_BYTES)
  }

  private allocate(): Handle {
    if (this.free.length === 0) this.grow()
    const handle = this.free.pop()! as Handle
    this.in_use[handle] = 1
    this.view.setUint32(handle * VALUE_BYTES, 0, true)
    this.view.setUint32(
      handle * VALUE_BYTES + 4,
      NAN_HIGH | VALUE_TAGS.UNDEFINED,
      true,
    )
    return handle
  }

  private free_slot(handle: Handle) {
    this.assert_handle(handle)
    this.bytes.fill(0, handle * VALUE_BYTES, (handle + 1) * VALUE_BYTES)
    this.in_use[handle] = 0
    this.free.push(handle)
  }

  private grow() {
    const capacity = this.in_use.length
    const bytes = new Uint8Array(capacity * 2 * VALUE_BYTES)
    bytes.set(this.bytes)
    const in_use = new Uint8Array(capacity * 2)
    in_use.set(this.in_use)
    this.bytes = bytes
    this.view = data_view(bytes)
    this.in_use = in_use
    for (let index = capacity * 2 - 1; index >= capacity; index--)
      this.free.push(index)
  }
}

declare const lifetime: unique symbol
