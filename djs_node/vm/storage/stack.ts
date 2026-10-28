import { panic } from "../../utils.ts"
import type { JSValue, ValueSpace } from "./heap.ts"
import { NAN_HIGH, VALUE_BYTES, VALUE_TAGS } from "./value.ts"

const STACK_BYTES = 1024 * 1024

/** The caller of the bottom frame, and the top of an empty stack. */
export const NO_FRAME = 0xffffffff
/** DESTINATION of a frame that settles a promise instead of writing a result. */
export const NO_DESTINATION = 0xffffffff

/**
 * Each frame is this header followed by its registers. The u32 fields come
 * first, then eight-byte values, all little-endian. Frames sit back to back,
 * innermost last.
 *
 * ```
 * fp+0   CALLER          offset of the caller's frame, or NO_FRAME
 * fp+4   PC
 * fp+8   CODE
 * fp+12  FUNCTION
 * fp+16  FLAGS           FRAME_FLAGS
 * fp+20  DESTINATION     index of the value RETURN writes, or NO_DESTINATION
 * fp+24  REGISTER_COUNT
 * fp+32  ENVIRONMENT     value
 * fp+40  THIS            value
 * fp+48  NEW_TARGET      value
 * fp+56  RESOLVE         value, for frames that settle a promise
 * fp+64  REJECT          value, for frames that settle a promise
 * fp+72  registers       REGISTER_COUNT values
 * ```
 */
export const FRAME = Object.freeze({
  CALLER: 0,
  PC: 4,
  CODE: 8,
  FUNCTION: 12,
  FLAGS: 16,
  DESTINATION: 20,
  REGISTER_COUNT: 24,
  ENVIRONMENT: 32,
  THIS: 40,
  NEW_TARGET: 48,
  RESOLVE: 56,
  REJECT: 64,
  REGISTERS: 72,
})

export const FRAME_FLAGS = Object.freeze({
  CONSTRUCT: 1,
  /** The frame settles the promise RESOLVE and REJECT belong to. */
  ASYNC: 2,
  /** DESTINATION indexes the handle table rather than the stack. */
  HANDLE_DESTINATION: 4,
})

/** A fixed-size stack of frames; see {@link FRAME} for their layout. */
export class CallStack implements ValueSpace {
  readonly bytes = new Uint8Array(STACK_BYTES)
  readonly view = new DataView(this.bytes.buffer)
  /** Offset of the innermost frame, or NO_FRAME. */
  fp = NO_FRAME
  /** Offset just past the innermost frame. */
  sp = 0

  assert_live(index: number) {
    if (!Number.isInteger(index) || index < 0 || index * VALUE_BYTES >= this.sp)
      panic(`Invalid stack slot: ${index}`)
  }

  /** The value at byte `offset`. */
  value_at(offset: number): JSValue {
    return { space: this, index: offset / VALUE_BYTES }
  }

  read_u32(offset: number) {
    return this.view.getUint32(offset, true)
  }

  write_u32(offset: number, value: number) {
    this.view.setUint32(offset, value, true)
  }

  /**
   * Pushes a frame with a zeroed header and undefined values, and returns
   * its offset, or undefined if the stack has no room for it.
   */
  push(register_count: number): number | undefined {
    const fp = this.sp
    const end = fp + FRAME.REGISTERS + register_count * VALUE_BYTES
    if (end > this.bytes.length) return undefined
    this.bytes.fill(0, fp, fp + FRAME.ENVIRONMENT)
    this.write_u32(fp + FRAME.CALLER, this.fp)
    this.write_u32(fp + FRAME.REGISTER_COUNT, register_count)
    for (let offset = fp + FRAME.ENVIRONMENT; offset < end; offset += 8) {
      this.write_u32(offset, 0)
      this.write_u32(offset + 4, NAN_HIGH | VALUE_TAGS.UNDEFINED)
    }
    this.fp = fp
    this.sp = end
    return fp
  }

  pop() {
    if (this.fp === NO_FRAME) panic("The call stack is empty")
    this.sp = this.fp
    this.fp = this.read_u32(this.fp + FRAME.CALLER)
  }

  /** Byte offset just past the values of the frame at `fp`. */
  frame_end(fp: number) {
    const count = this.read_u32(fp + FRAME.REGISTER_COUNT)
    return fp + FRAME.REGISTERS + count * VALUE_BYTES
  }

  trace(visit: (view: DataView, offset: number) => void) {
    for (
      let fp = this.fp;
      fp !== NO_FRAME;
      fp = this.read_u32(fp + FRAME.CALLER)
    ) {
      const end = this.frame_end(fp)
      for (let offset = fp + FRAME.ENVIRONMENT; offset < end; offset += 8)
        visit(this.view, offset)
    }
  }
}
