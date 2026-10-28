import type { JSValue } from "./storage/heap.ts"
import {
  FRAME,
  FRAME_FLAGS,
  NO_DESTINATION,
  NO_FRAME,
} from "./storage/stack.ts"
import { VALUE_BYTES } from "./storage/value.ts"
import { panic } from "../utils.ts"
import type { BytecodeOffset, RegisterIndex } from "../compiler/bytecode.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type { CodeId } from "../runtime/modules.ts"
import type { Runtime } from "../runtime/runtime.ts"

/**
 * A view of one call on the runtime's call stack. Frames of async functions and
 * program modules settle a promise instead of writing a result; at `await`
 * they are moved off the stack into a suspended frame until a resume function
 * puts them back on top.
 */
export class Frame {
  readonly runtime: Runtime
  /** The frame's offset in the call stack. */
  readonly fp: number

  constructor(runtime: Runtime, fp: number) {
    this.runtime = runtime
    this.fp = fp
  }

  /**
   * Pushes a frame whose RETURN writes to `destination`, or returns undefined
   * if the stack has no room for it. Its values start out undefined.
   */
  static push(
    runtime: Runtime,
    code_id: CodeId,
    function_id: FunctionId,
    register_count: number,
    destination: JSValue | null,
  ): Frame | undefined {
    const { stack } = runtime
    const fp = stack.push(register_count)
    if (fp === undefined) return undefined
    stack.write_u32(fp + FRAME.CODE, code_id)
    stack.write_u32(fp + FRAME.FUNCTION, function_id)
    if (destination === null)
      stack.write_u32(fp + FRAME.DESTINATION, NO_DESTINATION)
    else {
      if (destination.space !== stack)
        stack.write_u32(fp + FRAME.FLAGS, FRAME_FLAGS.HANDLE_DESTINATION)
      stack.write_u32(fp + FRAME.DESTINATION, destination.index)
    }
    return new Frame(runtime, fp)
  }

  get caller(): Frame | null {
    const fp = this.u32(FRAME.CALLER)
    return fp === NO_FRAME ? null : new Frame(this.runtime, fp)
  }

  get pc() {
    return this.u32(FRAME.PC) as BytecodeOffset
  }

  set pc(pc: BytecodeOffset) {
    this.runtime.stack.write_u32(this.fp + FRAME.PC, pc)
  }

  get code_id() {
    return this.u32(FRAME.CODE) as CodeId
  }

  get function_id() {
    return this.u32(FRAME.FUNCTION) as FunctionId
  }

  get is_construct_call() {
    return (this.u32(FRAME.FLAGS) & FRAME_FLAGS.CONSTRUCT) !== 0
  }

  set is_construct_call(value: boolean) {
    this.set_flag(FRAME_FLAGS.CONSTRUCT, value)
  }

  /** Where RETURN writes the result; null for frames that settle a promise. */
  get destination(): JSValue | null {
    const index = this.u32(FRAME.DESTINATION)
    if (index === NO_DESTINATION) return null
    if (this.u32(FRAME.FLAGS) & FRAME_FLAGS.HANDLE_DESTINATION)
      return this.runtime.heap.handles.handle_at(index)
    return { space: this.runtime.stack, index }
  }

  get environment() {
    return this.runtime.stack.value_at(this.fp + FRAME.ENVIRONMENT)
  }

  get this_value() {
    return this.runtime.stack.value_at(this.fp + FRAME.THIS)
  }

  get new_target() {
    return this.runtime.stack.value_at(this.fp + FRAME.NEW_TARGET)
  }

  /** Resolving functions of the promise this frame settles when it finishes. */
  get capability(): { resolve: JSValue; reject: JSValue } | undefined {
    if (!(this.u32(FRAME.FLAGS) & FRAME_FLAGS.ASYNC)) return undefined
    const { stack } = this.runtime
    return {
      resolve: stack.value_at(this.fp + FRAME.RESOLVE),
      reject: stack.value_at(this.fp + FRAME.REJECT),
    }
  }

  /** Makes this frame settle a promise with these resolving functions. */
  set_capability(resolve: JSValue, reject: JSValue) {
    const { heap, stack } = this.runtime
    heap.copy_value(stack.value_at(this.fp + FRAME.RESOLVE), resolve)
    heap.copy_value(stack.value_at(this.fp + FRAME.REJECT), reject)
    this.set_flag(FRAME_FLAGS.ASYNC, true)
  }

  get register_count() {
    return this.u32(FRAME.REGISTER_COUNT)
  }

  advance_pc(bytes: number) {
    this.pc = (this.pc + bytes) as BytecodeOffset
  }

  register(index: RegisterIndex): JSValue {
    if (!Number.isInteger(index) || index < 0 || index >= this.register_count)
      panic("Invalid register index")
    return this.runtime.stack.value_at(
      this.fp + FRAME.REGISTERS + index * VALUE_BYTES,
    )
  }

  private u32(field: number) {
    return this.runtime.stack.read_u32(this.fp + field)
  }

  private set_flag(flag: number, value: boolean) {
    const flags = this.u32(FRAME.FLAGS)
    this.runtime.stack.write_u32(
      this.fp + FRAME.FLAGS,
      value ? flags | flag : flags & ~flag,
    )
  }
}
