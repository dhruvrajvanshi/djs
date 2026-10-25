import type { Root } from "./memory.ts"
import { panic } from "../utils.ts"
import type { BytecodeOffset, RegisterIndex } from "../compiler/bytecode.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type { CodeId } from "../runtime/modules.ts"
import type { ModuleStateBytes } from "../runtime/module-state.ts"

export const CONTEXT_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
export type ContextStatus = (typeof CONTEXT_STATE)[keyof typeof CONTEXT_STATE]

export const HANDLER_PHASE = Object.freeze({ TRY: 0, CATCH: 1, FINALLY: 2 })
type HandlerPhase = (typeof HANDLER_PHASE)[keyof typeof HANDLER_PHASE]
// A JUMP completion's value is the target bytecode offset in the same frame.
export const COMPLETION_KIND = Object.freeze({
  NORMAL: 0,
  RETURN: 1,
  THROW: 2,
  JUMP: 3,
})
export type CompletionKind =
  (typeof COMPLETION_KIND)[keyof typeof COMPLETION_KIND]

/** The caller owns allocation/disposal of all roots. */
export class Context {
  readonly id: number
  readonly result: Root
  readonly error: Root
  status: ContextStatus = CONTEXT_STATE.READY
  frame: Frame | null = null
  handlers: Handler[] = []
  steps = 0
  await_rejected = false
  /** Shared with the module; not owned by this context. */
  module_state?: ModuleStateBytes
  settle?: { resolve: Root; reject: Root }

  constructor(id: number, result: Root, error: Root) {
    this.id = id
    this.result = result
    this.error = error
  }

  top_handler(): Handler | null {
    return this.handlers.at(-1) ?? null
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

/** completion_value_root and environment_root are owned by the handler. */
export class Handler {
  readonly frame: Frame
  readonly start_pc: BytecodeOffset
  readonly catch_pc: BytecodeOffset | null
  readonly finally_pc: BytecodeOffset | null
  readonly end_pc: BytecodeOffset
  readonly exception_register: RegisterIndex
  /** The frame environment when the handler was pushed. */
  readonly environment_root: Root
  readonly completion_value_root: Root
  phase: HandlerPhase = HANDLER_PHASE.TRY
  completion_kind: CompletionKind = COMPLETION_KIND.NORMAL

  constructor(fields: {
    frame: Frame
    start_pc: BytecodeOffset
    catch_pc: BytecodeOffset | null
    finally_pc: BytecodeOffset | null
    end_pc: BytecodeOffset
    exception_register: RegisterIndex
    completion_value_root: Root
    environment_root: Root
  }) {
    this.frame = fields.frame
    this.start_pc = fields.start_pc
    this.catch_pc = fields.catch_pc
    this.finally_pc = fields.finally_pc
    this.end_pc = fields.end_pc
    this.exception_register = fields.exception_register
    this.completion_value_root = fields.completion_value_root
    this.environment_root = fields.environment_root
  }

  enter_catch() {
    this.phase = HANDLER_PHASE.CATCH
  }

  save_completion(kind: CompletionKind) {
    this.phase = HANDLER_PHASE.FINALLY
    this.completion_kind = kind
  }
}
