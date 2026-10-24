import type { Brand } from "../utils.ts"
import type { Root } from "../vm/memory.ts"
import type { HostError } from "../host/node.ts"
import { read_root, read_optional_root } from "../vm/memory.ts"

type SchedulerControl = Brand<Uint8Array, "SchedulerControl">
type JobQueue = Brand<Uint8Array, "JobQueue">
type OperationTable = Brand<Uint8Array, "OperationTable">

export interface Completion {
  id: number
  result?: unknown
  error?: HostError
  rejected?: boolean
  syscall?: string
  path?: string
}

export interface Scheduler {
  control: SchedulerControl
  jobs: JobQueue
  operations: OperationTable
  completions: Completion[]
  wake: (() => void) | null
}

interface Job {
  callee: Root
  value: Root
  has_argument: boolean
}

interface Operation {
  resolve: Root
  reject: Root
  buffer: Root | null
  offset: number
  length: number
}

const NONE = 0xffffffff
const C = Object.freeze({
  JOB_HEAD: 0,
  JOB_TAIL: 4,
  OPERATION_COUNT: 8,
  PENDING: 12,
  TASK_STEPS: 16,
  FREE_OPERATION: 20,
})
const JOB_BYTES = 16
const J = Object.freeze({ CALLEE: 0, VALUE: 4, HAS_ARGUMENT: 8 })
const OPERATION_BYTES = 24
const O = Object.freeze({
  NEXT_FREE: 0,
  RESOLVE: 4,
  REJECT: 8,
  BUFFER: 12,
  OFFSET: 16,
  LENGTH: 20,
})

/** Storage only; callers own allocation and disposal of all stored roots. */
export function create_scheduler(): Scheduler {
  return {
    control: new Uint8Array(32) as SchedulerControl,
    jobs: new Uint8Array(JOB_BYTES * 16) as JobQueue,
    operations: new Uint8Array(OPERATION_BYTES * 16) as OperationTable,
    // Host completions contain host values and operation IDs, never heap pointers.
    completions: [],
    wake: null,
  }
}

function data_view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function grow(
  scheduler: Scheduler,
  field: "jobs" | "operations",
  required: number,
) {
  if (required <= scheduler[field].length) return
  const bytes = new Uint8Array(Math.max(required, scheduler[field].length * 2))
  bytes.set(scheduler[field])
  if (field === "jobs") scheduler.jobs = bytes as JobQueue
  else scheduler.operations = bytes as OperationTable
}

export function scheduler_has_jobs(scheduler: Scheduler): boolean {
  const view = data_view(scheduler.control)
  return view.getUint32(C.JOB_HEAD, true) < view.getUint32(C.JOB_TAIL, true)
}

export function scheduler_enqueue_job(scheduler: Scheduler, job: Job) {
  const control = data_view(scheduler.control)
  const index = control.getUint32(C.JOB_TAIL, true)
  grow(scheduler, "jobs", (index + 1) * JOB_BYTES)
  const view = data_view(scheduler.jobs),
    offset = index * JOB_BYTES
  view.setUint32(offset + J.CALLEE, job.callee, true)
  view.setUint32(offset + J.VALUE, job.value, true)
  view.setUint32(offset + J.HAS_ARGUMENT, job.has_argument ? 1 : 0, true)
  control.setUint32(C.JOB_TAIL, index + 1, true)
}

/** Remove before executing: jobs may enqueue, grow, or restart an empty queue. */
export function scheduler_take_job(scheduler: Scheduler): Job | null {
  if (!scheduler_has_jobs(scheduler)) return null
  const control = data_view(scheduler.control)
  const index = control.getUint32(C.JOB_HEAD, true)
  const view = data_view(scheduler.jobs),
    offset = index * JOB_BYTES
  const job = {
    callee: read_root(view, offset + J.CALLEE),
    value: read_root(view, offset + J.VALUE),
    has_argument: view.getUint32(offset + J.HAS_ARGUMENT, true) !== 0,
  }
  const next = index + 1
  if (next === control.getUint32(C.JOB_TAIL, true)) {
    control.setUint32(C.JOB_HEAD, 0, true)
    control.setUint32(C.JOB_TAIL, 0, true)
  } else control.setUint32(C.JOB_HEAD, next, true)
  return job
}

export function scheduler_pending_operations(scheduler: Scheduler): number {
  return data_view(scheduler.control).getUint32(C.PENDING, true)
}

export function scheduler_allocate_operation(
  scheduler: Scheduler,
  operation: Operation,
): number {
  const control = data_view(scheduler.control)
  // Free-list links encode id + 1 so zero denotes an empty list.
  const available = control.getUint32(C.FREE_OPERATION, true)
  const id = available
    ? available - 1
    : control.getUint32(C.OPERATION_COUNT, true)
  if (available)
    control.setUint32(
      C.FREE_OPERATION,
      data_view(scheduler.operations).getUint32(
        id * OPERATION_BYTES + O.NEXT_FREE,
        true,
      ),
      true,
    )
  else control.setUint32(C.OPERATION_COUNT, id + 1, true)
  grow(scheduler, "operations", (id + 1) * OPERATION_BYTES)
  const view = data_view(scheduler.operations),
    offset = id * OPERATION_BYTES
  view.setUint32(offset + O.NEXT_FREE, NONE, true)
  view.setUint32(offset + O.RESOLVE, operation.resolve, true)
  view.setUint32(offset + O.REJECT, operation.reject, true)
  view.setUint32(offset + O.BUFFER, operation.buffer ?? NONE, true)
  view.setUint32(offset + O.OFFSET, operation.offset, true)
  view.setUint32(offset + O.LENGTH, operation.length, true)
  control.setUint32(
    C.PENDING,
    scheduler_pending_operations(scheduler) + 1,
    true,
  )
  return id
}

export function scheduler_operation(
  scheduler: Scheduler,
  id: number,
): Operation {
  const view = data_view(scheduler.operations),
    offset = id * OPERATION_BYTES
  return {
    resolve: read_root(view, offset + O.RESOLVE),
    reject: read_root(view, offset + O.REJECT),
    buffer: read_optional_root(view, offset + O.BUFFER),
    offset: view.getUint32(offset + O.OFFSET, true),
    length: view.getUint32(offset + O.LENGTH, true),
  }
}

/** Caller must release the operation's roots first. */
export function scheduler_release_operation(scheduler: Scheduler, id: number) {
  const control = data_view(scheduler.control)
  data_view(scheduler.operations).setUint32(
    id * OPERATION_BYTES + O.NEXT_FREE,
    control.getUint32(C.FREE_OPERATION, true),
    true,
  )
  control.setUint32(C.FREE_OPERATION, id + 1, true)
  control.setUint32(
    C.PENDING,
    scheduler_pending_operations(scheduler) - 1,
    true,
  )
}

export function scheduler_reset_task_steps(scheduler: Scheduler) {
  data_view(scheduler.control).setUint32(C.TASK_STEPS, 0, true)
}

export function scheduler_increment_task_steps(scheduler: Scheduler): number {
  const view = data_view(scheduler.control)
  const steps = view.getUint32(C.TASK_STEPS, true) + 1
  view.setUint32(C.TASK_STEPS, steps, true)
  return steps
}
