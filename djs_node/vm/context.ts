import type { Root } from "./memory.ts"
import type { Brand } from "../utils.ts"
import type { BytecodeOffset, RegisterIndex } from "../compiler/bytecode.ts"
import type { FunctionId } from "../compiler/compile.ts"
import type { CodeId } from "../runtime/modules.ts"
import type { ModuleStateBytes } from "../runtime/module-state.ts"
import { read_root, read_optional_root } from "./memory.ts"

type ContextControl = Brand<Uint8Array, "ContextControl">

export const CONTEXT_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
type ContextStatus = (typeof CONTEXT_STATE)[keyof typeof CONTEXT_STATE]

export type Context = {
  id: number
  control: ContextControl
  frames: FrameStack
  handlers: HandlerStack
  /** Shared with the module; not owned by this context. */
  module_state?: ModuleStateBytes
  settle?: { resolve: Root; reject: Root }
}

const NONE = 0xffffffff
// Eight little-endian u32 fields. RESULT and ERROR contain root handles.
const C = Object.freeze({
  STATUS: 0,
  FRAME: 4,
  USED: 8,
  RESULT: 12,
  ERROR: 16,
  STEPS: 20,
  HANDLERS: 24,
  REJECTED: 28,
})

/** Opaque frame handle belonging to a context; valid until that frame is popped. */
export type Frame = Brand<number, "Frame">
type FrameStack = Brand<Uint8Array, "FrameStack">

interface FrameHeader {
  caller: Frame | null
  code_id: CodeId
  function_id: FunctionId
  return_root: Root | null
  environment_root: Root
  this_root: Root
  new_target_root: Root
  register_count: number
}

// A 40-byte header followed by COUNT u32 register root handles.
const FRAME_BYTES = 40
const F = Object.freeze({
  CALLER: 0,
  CODE: 4,
  FUNCTION: 8,
  PC: 12,
  RETURN: 16,
  ENV: 20,
  THIS: 24,
  COUNT: 28,
  CONSTRUCT: 32,
  NEW_TARGET: 36,
})

/** Allocates storage only. The caller owns allocation/disposal of all roots. */
export function context_create_storage(
  id: number,
  result: Root,
  error: Root,
): Context {
  const context: Context = {
    id,
    control: new Uint8Array(32) as ContextControl,
    frames: new Uint8Array(1024) as FrameStack,
    handlers: new Uint8Array(256) as HandlerStack,
  }
  const view = data_view(context.control)
  view.setUint32(C.FRAME, NONE, true)
  view.setUint32(C.RESULT, result, true)
  view.setUint32(C.ERROR, error, true)
  return context
}

export function context_status(context: Context): ContextStatus {
  return data_view(context.control).getUint32(C.STATUS, true) as ContextStatus
}

export function context_set_status(context: Context, status: ContextStatus) {
  data_view(context.control).setUint32(C.STATUS, status, true)
}

export function context_current_frame(context: Context): Frame | null {
  const offset = data_view(context.control).getUint32(C.FRAME, true)
  return offset === NONE ? null : (offset as Frame)
}

function context_set_current_frame(context: Context, frame: Frame | null) {
  data_view(context.control).setUint32(C.FRAME, frame ?? NONE, true)
}

export function context_result(context: Context): Root {
  return read_root(data_view(context.control), C.RESULT)
}

export function context_error(context: Context): Root {
  return read_root(data_view(context.control), C.ERROR)
}

function context_used_frame_bytes(context: Context): number {
  return data_view(context.control).getUint32(C.USED, true)
}

export function context_handler_count(context: Context): number {
  return data_view(context.control).getUint32(C.HANDLERS, true)
}

function context_set_used_frame_bytes(context: Context, used: number) {
  data_view(context.control).setUint32(C.USED, used, true)
}

export function context_increment_steps(context: Context): number {
  const view = data_view(context.control)
  const steps = view.getUint32(C.STEPS, true) + 1
  view.setUint32(C.STEPS, steps, true)
  return steps
}

export function context_set_await_rejection(
  context: Context,
  rejected: boolean,
) {
  data_view(context.control).setUint32(C.REJECTED, rejected ? 1 : 0, true)
}

export function context_take_await_rejection(context: Context): boolean {
  const view = data_view(context.control)
  const rejected = view.getUint32(C.REJECTED, true) !== 0
  view.setUint32(C.REJECTED, 0, true)
  return rejected
}

/** Grow before initialization; accessors always resolve the current storage. */
export function context_reserve_frame(
  context: Context,
  register_count: number,
): Frame {
  const offset = context_used_frame_bytes(context)
  const required = offset + context_frame_byte_length(register_count)
  if (required > context.frames.length) {
    const frames = new Uint8Array(
      Math.max(required, context.frames.length * 2),
    ) as FrameStack
    frames.set(context.frames)
    context.frames = frames
  }
  return offset as Frame
}

export function context_top_handler(context: Context): HandlerOffset | null {
  const count = context_handler_count(context)
  return count === 0 ? null : (((count - 1) * HANDLER_BYTES) as HandlerOffset)
}

export function context_push_handler(context: Context, header: HandlerHeader) {
  const count = context_handler_count(context)
  if ((count + 1) * HANDLER_BYTES > context.handlers.length) {
    const handlers = new Uint8Array(context.handlers.length * 2) as HandlerStack
    handlers.set(context.handlers)
    context.handlers = handlers
  }
  const offset = count * HANDLER_BYTES
  const view = data_view(context.handlers)
  view.setUint32(offset + H.FRAME, header.frame, true)
  view.setUint32(offset + H.CATCH, header.catch_pc ?? NONE, true)
  view.setUint32(offset + H.FINALLY, header.finally_pc ?? NONE, true)
  view.setUint32(offset + H.END, header.end_pc, true)
  view.setUint32(offset + H.EXCEPTION, header.exception_register, true)
  view.setUint32(offset + H.PHASE, HANDLER_PHASE.TRY, true)
  view.setUint32(offset + H.COMPLETION, COMPLETION_KIND.NORMAL, true)
  view.setUint32(offset + H.VALUE, header.completion_value_root, true)
  view.setUint32(offset + H.ENV, header.environment_root, true)
  view.setUint32(offset + H.START, header.start_pc, true)
  data_view(context.control).setUint32(C.HANDLERS, count + 1, true)
}

/** Caller must release the handler's completion value and environment roots first. */
export function context_pop_handler(context: Context) {
  data_view(context.control).setUint32(
    C.HANDLERS,
    context_handler_count(context) - 1,
    true,
  )
}

function context_frame_byte_length(register_count: number): number {
  return FRAME_BYTES + register_count * 4
}

/** Publish only after the caller has initialized the frame and all its roots. */
export function context_commit_frame(context: Context, frame: Frame) {
  context_set_current_frame(context, frame)
  context_set_used_frame_bytes(
    context,
    frame +
      context_frame_byte_length(context_frame_register_count(context, frame)),
  )
}

/** Caller must release the frame's roots before reclaiming its storage. */
export function context_pop_frame(context: Context) {
  const frame = context_current_frame(context)
  if (frame === null) throw new Error("No active frame")
  context_set_current_frame(context, context_frame_caller(context, frame))
  context_set_used_frame_bytes(context, frame)
}

export function context_initialize_frame(
  context: Context,
  frame: Frame,
  header: FrameHeader,
) {
  const view = data_view(context.frames)
  view.setUint32(frame + F.CALLER, header.caller ?? NONE, true)
  view.setUint32(frame + F.CODE, header.code_id, true)
  view.setUint32(frame + F.FUNCTION, header.function_id, true)
  view.setUint32(frame + F.PC, 0, true)
  view.setUint32(frame + F.RETURN, header.return_root ?? NONE, true)
  view.setUint32(frame + F.ENV, header.environment_root, true)
  view.setUint32(frame + F.THIS, header.this_root, true)
  view.setUint32(frame + F.COUNT, header.register_count, true)
  view.setUint32(frame + F.CONSTRUCT, 0, true)
  view.setUint32(frame + F.NEW_TARGET, header.new_target_root, true)
}

export function context_frame_caller(
  context: Context,
  frame: Frame,
): Frame | null {
  const value = data_view(context.frames).getUint32(frame + F.CALLER, true)
  return value === NONE ? null : (value as Frame)
}

export function context_frame_code_id(context: Context, frame: Frame): CodeId {
  return data_view(context.frames).getUint32(frame + F.CODE, true) as CodeId
}

export function context_frame_function_id(
  context: Context,
  frame: Frame,
): FunctionId {
  return data_view(context.frames).getUint32(
    frame + F.FUNCTION,
    true,
  ) as FunctionId
}

export function context_frame_pc(
  context: Context,
  frame: Frame,
): BytecodeOffset {
  return data_view(context.frames).getUint32(
    frame + F.PC,
    true,
  ) as BytecodeOffset
}

export function context_frame_return_root(
  context: Context,
  frame: Frame,
): Root | null {
  return read_optional_root(data_view(context.frames), frame + F.RETURN)
}

export function context_frame_environment_root(
  context: Context,
  frame: Frame,
): Root {
  return read_root(data_view(context.frames), frame + F.ENV)
}

export function context_frame_this_root(context: Context, frame: Frame): Root {
  return read_root(data_view(context.frames), frame + F.THIS)
}

export function context_frame_new_target_root(
  context: Context,
  frame: Frame,
): Root {
  return read_root(data_view(context.frames), frame + F.NEW_TARGET)
}

export function context_frame_register_count(
  context: Context,
  frame: Frame,
): number {
  return data_view(context.frames).getUint32(frame + F.COUNT, true)
}

export function context_frame_is_construct_call(
  context: Context,
  frame: Frame,
): boolean {
  return data_view(context.frames).getUint32(frame + F.CONSTRUCT, true) !== 0
}

export function context_set_frame_pc(
  context: Context,
  frame: Frame,
  pc: BytecodeOffset,
) {
  data_view(context.frames).setUint32(frame + F.PC, pc, true)
}

export function context_advance_frame_pc(
  context: Context,
  frame: Frame,
  bytes: number,
) {
  data_view(context.frames).setUint32(
    frame + F.PC,
    context_frame_pc(context, frame) + bytes,
    true,
  )
}

export function context_set_frame_construct_call(
  context: Context,
  frame: Frame,
) {
  data_view(context.frames).setUint32(frame + F.CONSTRUCT, 1, true)
}

export function context_frame_register_root(
  context: Context,
  frame: Frame,
  index: RegisterIndex,
): Root {
  return read_root(
    data_view(context.frames),
    register_offset(context, frame, index),
  )
}

export function context_set_frame_register_root(
  context: Context,
  frame: Frame,
  index: RegisterIndex,
  root: Root,
) {
  data_view(context.frames).setUint32(
    register_offset(context, frame, index),
    root,
    true,
  )
}

function register_offset(
  context: Context,
  frame: Frame,
  index: RegisterIndex,
): number {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= context_frame_register_count(context, frame)
  )
    throw new RangeError("Invalid register index")
  return frame + FRAME_BYTES + index * 4
}

/** Byte offset into a context's handler stack; valid until that handler is popped. */
export type HandlerOffset = Brand<number, "HandlerOffset">
type HandlerStack = Brand<Uint8Array, "HandlerStack">

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

interface HandlerHeader {
  frame: Frame
  start_pc: BytecodeOffset
  catch_pc: BytecodeOffset | null
  finally_pc: BytecodeOffset | null
  end_pc: BytecodeOffset
  exception_register: RegisterIndex
  completion_value_root: Root
  environment_root: Root
}

// Ten u32 fields. EXCEPTION is a register index; VALUE and ENV are owned roots.
// ENV is the frame environment when the handler was pushed.
const HANDLER_BYTES = 40
const H = Object.freeze({
  FRAME: 0,
  CATCH: 4,
  FINALLY: 8,
  END: 12,
  EXCEPTION: 16,
  PHASE: 20,
  COMPLETION: 24,
  VALUE: 28,
  ENV: 32,
  START: 36,
})

export function handler_frame(
  handlers: HandlerStack,
  handler: HandlerOffset,
): Frame {
  return data_view(handlers).getUint32(handler + H.FRAME, true) as Frame
}

export function handler_catch_pc(
  handlers: HandlerStack,
  handler: HandlerOffset,
): BytecodeOffset | null {
  const value = data_view(handlers).getUint32(handler + H.CATCH, true)
  return value === NONE ? null : (value as BytecodeOffset)
}

export function handler_finally_pc(
  handlers: HandlerStack,
  handler: HandlerOffset,
): BytecodeOffset | null {
  const value = data_view(handlers).getUint32(handler + H.FINALLY, true)
  return value === NONE ? null : (value as BytecodeOffset)
}

export function handler_end_pc(
  handlers: HandlerStack,
  handler: HandlerOffset,
): BytecodeOffset {
  return data_view(handlers).getUint32(handler + H.END, true) as BytecodeOffset
}

export function handler_exception_register(
  handlers: HandlerStack,
  handler: HandlerOffset,
): RegisterIndex {
  return data_view(handlers).getUint32(
    handler + H.EXCEPTION,
    true,
  ) as RegisterIndex
}

export function handler_phase(
  handlers: HandlerStack,
  handler: HandlerOffset,
): HandlerPhase {
  return data_view(handlers).getUint32(handler + H.PHASE, true) as HandlerPhase
}

export function handler_completion_kind(
  handlers: HandlerStack,
  handler: HandlerOffset,
): CompletionKind {
  return data_view(handlers).getUint32(
    handler + H.COMPLETION,
    true,
  ) as CompletionKind
}

export function handler_completion_value_root(
  handlers: HandlerStack,
  handler: HandlerOffset,
): Root {
  return read_root(data_view(handlers), handler + H.VALUE)
}

export function handler_environment_root(
  handlers: HandlerStack,
  handler: HandlerOffset,
): Root {
  return read_root(data_view(handlers), handler + H.ENV)
}

export function handler_start_pc(
  handlers: HandlerStack,
  handler: HandlerOffset,
): BytecodeOffset {
  return data_view(handlers).getUint32(
    handler + H.START,
    true,
  ) as BytecodeOffset
}

export function handler_enter_catch(
  handlers: HandlerStack,
  handler: HandlerOffset,
) {
  data_view(handlers).setUint32(handler + H.PHASE, HANDLER_PHASE.CATCH, true)
}

export function handler_save_completion(
  handlers: HandlerStack,
  handler: HandlerOffset,
  kind: CompletionKind,
) {
  const view = data_view(handlers)
  view.setUint32(handler + H.PHASE, HANDLER_PHASE.FINALLY, true)
  view.setUint32(handler + H.COMPLETION, kind, true)
}

function data_view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
