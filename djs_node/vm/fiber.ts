import type { Handle, Persistent } from "./storage/heap.ts"
import { panic } from "../utils.ts"
import type { BytecodeOffset, RegisterIndex } from "../compiler/bytecode.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type { CodeId } from "../runtime/modules.ts"

export const FIBER_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
export type FiberStatus = (typeof FIBER_STATE)[keyof typeof FIBER_STATE]

/**
 * A stack of frames that runs, suspends at `await` and resumes as a unit. Each
 * module evaluation, async function call, job and JavaScript call made from VM
 * code gets its own. A fiber owns its handles and its frames'; dispose_fiber
 * releases them.
 */
export class Fiber {
  readonly id: number
  readonly result: Persistent
  readonly error: Persistent
  status: FiberStatus = FIBER_STATE.READY
  frame: Frame | null = null
  await_rejected = false
  /** Resolving functions of the promise this fiber settles when it finishes. */
  settle?: { resolve: Persistent; reject: Persistent }

  constructor(id: number, result: Persistent, error: Persistent) {
    this.id = id
    this.result = result
    this.error = error
  }

  take_await_rejection(): boolean {
    const rejected = this.await_rejected
    this.await_rejected = false
    return rejected
  }
}

export class Frame {
  readonly caller: Frame | null
  readonly code_id: CodeId
  readonly function_id: FunctionId
  pc = 0 as BytecodeOffset
  /** Where RETURN writes the result; null for a fiber's first frame. */
  readonly destination: Handle | null
  readonly environment: Persistent
  readonly this_value: Persistent
  readonly new_target: Persistent
  is_construct_call = false
  /** The frame owns these and its other persistent handles; pop_frame releases them. */
  readonly registers: Persistent[]

  constructor(fields: {
    caller: Frame | null
    code_id: CodeId
    function_id: FunctionId
    destination: Handle | null
    environment: Persistent
    this_value: Persistent
    new_target: Persistent
    registers: Persistent[]
  }) {
    this.caller = fields.caller
    this.code_id = fields.code_id
    this.function_id = fields.function_id
    this.destination = fields.destination
    this.environment = fields.environment
    this.this_value = fields.this_value
    this.new_target = fields.new_target
    this.registers = fields.registers
  }

  advance_pc(bytes: number) {
    this.pc = (this.pc + bytes) as BytecodeOffset
  }

  register(index: RegisterIndex): Handle {
    if (!Number.isInteger(index) || index < 0 || index >= this.registers.length)
      panic("Invalid register index")
    return this.registers[index]
  }
}
