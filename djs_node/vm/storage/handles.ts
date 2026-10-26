import { panic } from "../../utils.ts"
import type { Handle, Persistent } from "./value.ts"
import { NAN_HIGH, VALUE_TAGS, VALUE_BYTES } from "./value.ts"

const INITIAL_CAPACITY = 64

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * The slots host code refers to guest values through. The collector updates
 * the reference in every slot in use, so a handle stays valid across
 * collections while an Address does not.
 *
 * A handle is either local, released when the innermost open `scope` closes,
 * or persistent, released by its owner with `release`.
 */
export class HandleTable {
  bytes: Uint8Array
  view: DataView
  in_use: Uint8Array
  /** Free slot indices, most recently released last. */
  private free: number[] = []
  /** Local handles of the open scopes, innermost last. */
  private locals: Handle[] = []
  private scope_starts: number[] = []

  constructor() {
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

  /** Runs `body`, then releases every local handle it created. */
  scope<T>(body: () => T): T {
    this.scope_starts.push(this.locals.length)
    try {
      return body()
    } finally {
      const start = this.scope_starts.pop()!
      while (this.locals.length > start) this.free_slot(this.locals.pop()!)
    }
  }

  /** A handle holding undefined, released when the current scope closes. */
  local(): Handle {
    if (this.scope_starts.length === 0) panic("No open handle scope")
    const handle = this.allocate()
    this.locals.push(handle)
    return handle
  }

  /** A handle holding undefined, released only by `release`. */
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

  /** Calls `visit` with the byte offset of every slot in use. */
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
