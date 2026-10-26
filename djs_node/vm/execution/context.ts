import type { Root } from "../storage/value.ts"
import { panic } from "../../utils.ts"
import type { BytecodeOffset, RegisterIndex } from "../../compiler/bytecode.ts"
import type { FunctionId } from "../../compiler/compile.ts"
import type { CodeId, ModuleRecord } from "../../runtime/modules.ts"

export const CONTEXT_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
export type ContextStatus = (typeof CONTEXT_STATE)[keyof typeof CONTEXT_STATE]

/**
 * A stack of frames that runs, suspends at `await` and resumes as a unit. Each
 * module evaluation, async function call, job and JavaScript call made from VM
 * code gets its own. The caller owns allocation/disposal of all roots.
 */
export class Context {
  readonly id: number
  readonly result: Root
  readonly error: Root
  status: ContextStatus = CONTEXT_STATE.READY
  frame: Frame | null = null
  steps = 0
  await_rejected = false
  /** The module this context evaluates, if any; not owned by the context. */
  module?: ModuleRecord
  settle?: { resolve: Root; reject: Root }

  constructor(id: number, result: Root, error: Root) {
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
  readonly return_root: Root | null
  readonly environment_root: Root
  readonly this_root: Root
  readonly new_target_root: Root
  is_construct_call = false
  readonly registers: Root[]

  constructor(fields: {
    caller: Frame | null
    code_id: CodeId
    function_id: FunctionId
    return_root: Root | null
    environment_root: Root
    this_root: Root
    new_target_root: Root
    registers: Root[]
  }) {
    this.caller = fields.caller
    this.code_id = fields.code_id
    this.function_id = fields.function_id
    this.return_root = fields.return_root
    this.environment_root = fields.environment_root
    this.this_root = fields.this_root
    this.new_target_root = fields.new_target_root
    this.registers = fields.registers
  }

  advance_pc(bytes: number) {
    this.pc = (this.pc + bytes) as BytecodeOffset
  }

  register(index: RegisterIndex): Root {
    if (!Number.isInteger(index) || index < 0 || index >= this.registers.length)
      panic("Invalid register index")
    return this.registers[index]
  }
}
