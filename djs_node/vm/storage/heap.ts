import { panic, type Brand } from "../../utils.ts"
import type { Address } from "./value.ts"
import { NAN_HIGH, VALUE_TAGS, VALUE_BYTES } from "./value.ts"
import { HEADER, LAYOUTS, type HeapType } from "./layout.ts"
import type { CallStack } from "./stack.ts"

const FORWARDED = 0xffffffff

const SEMISPACE_BYTES = 1024 * 1024

/**
 * A guest value the VM is holding: a {@link Handle}, or a value in a frame on
 * the {@link CallStack}. The garbage collector traces both, so heap references in
 * a JSValue are "re-pointed" automatically when a collection moves the
 * objects they refer to.
 */
export interface JSValue {
  readonly space: ValueSpace
  readonly index: number
}

/** Storage made of eight-byte value slots, which a JSValue indexes. */
export interface ValueSpace {
  readonly bytes: Uint8Array
  readonly view: DataView
  /** Panics unless slot `index` holds a live value. */
  assert_live(index: number): void
}

/**
 * A JSValue in a table of values managed by the heap. The VM creates handles
 * to keep values it is working with alive.
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
export type Handle = Brand<JSValue, "Handle">

/**
 * Like a {@link Handle}, but it is released explicitly using {@link HandleTable.release}.
 * Used for values that live for the whole program, or whose lifetime isn’t tied to a scope.
 */
export type Persistent = Handle & { readonly [lifetime]: "persistent" }

export class Heap {
  bytes: Uint8Array
  view: DataView
  readonly handles: HandleTable = new HandleTable()
  /** The runtime's call stack, whose frames hold roots. */
  private readonly stack: CallStack
  readonly semispace_bytes = SEMISPACE_BYTES
  active_start = 8
  allocation_cursor = 8

  constructor(stack: CallStack) {
    this.stack = stack
    this.bytes = new Uint8Array(8 + this.semispace_bytes * 2)
    this.view = data_view(this.bytes)
  }

  copy_value(destination: JSValue, source: JSValue) {
    assert_live(destination)
    assert_live(source)
    destination.space.bytes.set(
      source.space.bytes.subarray(
        source.index * VALUE_BYTES,
        (source.index + 1) * VALUE_BYTES,
      ),
      destination.index * VALUE_BYTES,
    )
  }

  load_value(value: JSValue, address: Address) {
    assert_live(value)
    value.space.bytes.set(
      this.bytes.subarray(address, address + VALUE_BYTES),
      value.index * VALUE_BYTES,
    )
  }

  store_value(address: Address, value: JSValue) {
    assert_live(value)
    this.bytes.set(
      value.space.bytes.subarray(
        value.index * VALUE_BYTES,
        (value.index + 1) * VALUE_BYTES,
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
    this.stack.trace((view, offset) =>
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

export function assert_live(value: JSValue) {
  value.space.assert_live(value.index)
}

export function data_view(bytes: Uint8Array) {
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

class HandleTable implements ValueSpace {
  bytes: Uint8Array
  view: DataView
  in_use: Uint8Array
  /** The handle for each slot, so a slot's handle is always the same object. */
  private handles: Handle[] = []
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
    this.add_slots(0, INITIAL_CAPACITY)
  }

  assert_live(index: number) {
    if (!Number.isInteger(index) || index < 0 || this.in_use[index] !== 1) {
      panic(`Invalid handle: ${index}`)
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

  /** The live handle for slot `index`. */
  handle_at(index: number): Handle {
    this.assert_live(index)
    return this.handles[index]
  }

  trace(visit: (view: DataView, offset: number) => void) {
    for (let index = 0; index < this.in_use.length; index++)
      if (this.in_use[index] === 1) visit(this.view, index * VALUE_BYTES)
  }

  private allocate(): Handle {
    if (this.free.length === 0) this.grow()
    const index = this.free.pop()!
    this.in_use[index] = 1
    this.view.setUint32(index * VALUE_BYTES, 0, true)
    this.view.setUint32(
      index * VALUE_BYTES + 4,
      NAN_HIGH | VALUE_TAGS.UNDEFINED,
      true,
    )
    return this.handles[index]
  }

  private free_slot(handle: Handle) {
    assert_live(handle)
    const { index } = handle
    this.bytes.fill(0, index * VALUE_BYTES, (index + 1) * VALUE_BYTES)
    this.in_use[index] = 0
    this.free.push(index)
  }

  private add_slots(start: number, end: number) {
    for (let index = start; index < end; index++)
      this.handles.push({ space: this, index } as JSValue as Handle)
    for (let index = end - 1; index >= start; index--) this.free.push(index)
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
    this.add_slots(capacity, capacity * 2)
  }
}

declare const lifetime: unique symbol
