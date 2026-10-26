import type { Root } from "../vm/storage/value.ts"
import { kind_of, write_number } from "../vm/storage/value.ts"
import { KINDS } from "../vm/storage/layout.ts"
import type { Runtime } from "./runtime.ts"
import type { HostError } from "../host/node.ts"
import { write_string } from "../vm/records/string.ts"
import { byte_buffer_view } from "../vm/records/byte_buffer.ts"
import { create_error } from "../vm/semantics/errors.ts"
import { define_property } from "../vm/semantics/properties.ts"
import { to_string, write_primitive } from "../vm/semantics/operations.ts"
import { FIBER_STATE } from "../vm/execution/fiber.ts"
import { create_call_fiber, dispose_fiber } from "../vm/execution/calls.ts"
import { run_task } from "../vm/execution/interpreter.ts"
import { panic } from "../utils.ts"

export interface Completion {
  id: number
  result?: unknown
  error?: HostError
  rejected?: boolean
  syscall?: string
  path?: string
}

/** Callers own allocation and disposal of every stored root. */
export interface Job {
  callee: Root
  value: Root
  has_argument: boolean
}

export interface Operation {
  resolve: Root
  reject: Root
  buffer: Root | null
  offset: number
  length: number
}

/** The job queue and pending host operations of one runtime. */
export class Scheduler {
  jobs: Job[] = []
  job_head = 0
  /** Indexed by operation id; released slots are reused. */
  operations: (Operation | null)[] = []
  free_operations: number[] = []
  pending_operations = 0
  // Host completions contain host values and operation IDs, never heap pointers.
  completions: Completion[] = []
  wake: (() => void) | null = null
  /** Instructions run by the current task, across all of its fibers. */
  task_steps = 0

  has_jobs() {
    return this.job_head < this.jobs.length
  }

  enqueue_job(job: Job) {
    this.jobs.push(job)
  }

  /** Remove before executing: jobs may enqueue more jobs. */
  take_job(): Job | null {
    if (!this.has_jobs()) return null
    const job = this.jobs[this.job_head++]
    if (this.job_head === this.jobs.length) {
      this.jobs = []
      this.job_head = 0
    }
    return job
  }

  allocate_operation(operation: Operation): number {
    const id = this.free_operations.pop() ?? this.operations.length
    this.operations[id] = operation
    this.pending_operations++
    return id
  }

  operation(id: number): Operation {
    const operation = this.operations[id]
    if (!operation) panic(`Invalid operation ID: ${id}`)
    return operation
  }

  /** Caller must release the operation's roots first. */
  release_operation(id: number) {
    this.operation(id)
    this.operations[id] = null
    this.free_operations.push(id)
    this.pending_operations--
  }
}

function notify(runtime: Runtime) {
  const wake = runtime.scheduler.wake
  runtime.scheduler.wake = null
  if (wake) wake()
}

export function enqueue_job(runtime: Runtime, callee: Root, argument?: Root) {
  const { memory, scheduler } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    panic("Job is not callable")
  const fn = memory.alloc_root(),
    value = memory.alloc_root()
  memory.copy_value(fn, callee)
  if (argument !== undefined) memory.copy_value(value, argument)
  scheduler.enqueue_job({
    callee: fn,
    value,
    has_argument: argument !== undefined,
  })
  notify(runtime)
}

export interface OperationOptions {
  buffer?: Root
  offset?: number
  length?: number
  syscall?: string
  path?: string
}

export function start_operation(
  runtime: Runtime,
  resolve: Root,
  reject: Root,
  begin: () => unknown | PromiseLike<unknown>,
  { buffer, offset = 0, length = 0, syscall, path }: OperationOptions = {},
) {
  const { memory, scheduler } = runtime
  if (
    resolve === undefined ||
    reject === undefined ||
    kind_of(memory, resolve) !== KINDS.FUNCTION ||
    kind_of(memory, reject) !== KINDS.FUNCTION
  )
    panic("I/O operation requires resolve and reject callbacks")
  const resolve_root = memory.alloc_root(),
    reject_root = memory.alloc_root(),
    buffer_root = buffer === undefined ? null : memory.alloc_root()
  memory.copy_value(resolve_root, resolve)
  memory.copy_value(reject_root, reject)
  if (buffer !== undefined && buffer_root !== null)
    memory.copy_value(buffer_root, buffer)
  const id = scheduler.allocate_operation({
    resolve: resolve_root,
    reject: reject_root,
    buffer: buffer_root,
    offset,
    length,
  })
  Promise.resolve()
    .then(begin)
    .then(
      (result) => {
        scheduler.completions.push({ id, result, syscall, path })
        notify(runtime)
      },
      (error) => {
        scheduler.completions.push({ id, error, rejected: true, syscall, path })
        notify(runtime)
      },
    )
}

function operation_error(
  runtime: Runtime,
  destination: Root,
  error: HostError,
  syscall?: string,
  path?: string,
) {
  const { memory } = runtime
  create_error(runtime, destination, "Error", String(error?.message ?? error))
  const key = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    for (const [name, item] of Object.entries({
      code: error?.code,
      syscall,
      path,
    })) {
      if (item === undefined) continue
      write_string(memory, key, name)
      write_primitive(runtime, value, item)
      define_property(runtime, destination, key, value)
    }
  } finally {
    memory.free_root(key)
    memory.free_root(value)
  }
}

export function drain_completions(runtime: Runtime) {
  const { memory, scheduler } = runtime
  while (scheduler.completions.length) {
    const completion = scheduler.completions.shift()!
    const { resolve, reject, buffer, offset, length } = scheduler.operation(
      completion.id,
    )
    const value = memory.alloc_root()
    try {
      let rejected = completion.rejected
      try {
        if (rejected) throw completion.error
        if (buffer !== null) {
          const bytes = completion.result
          if (!(bytes instanceof Uint8Array) || bytes.length > length)
            throw new TypeError("Host read returned invalid bytes")
          // Resolve the rooted buffer again here; it may have moved while waiting.
          byte_buffer_view(memory, buffer).set(bytes, offset)
          write_number(memory, value, bytes.length)
        } else write_primitive(runtime, value, completion.result)
      } catch (error) {
        rejected = true
        operation_error(
          runtime,
          value,
          error,
          completion.syscall,
          completion.path,
        )
      }
      enqueue_job(runtime, rejected ? reject : resolve, value)
    } finally {
      memory.free_root(value)
      memory.free_root(resolve)
      memory.free_root(reject)
      if (buffer !== null) memory.free_root(buffer)
      scheduler.release_operation(completion.id)
    }
  }
}

export function drain_jobs(runtime: Runtime) {
  const { memory, scheduler } = runtime
  while (scheduler.has_jobs()) {
    const { callee, value, has_argument } = scheduler.take_job()!
    let job
    try {
      job = create_call_fiber(
        runtime,
        callee,
        undefined,
        has_argument ? [value] : [],
      )
      run_task(runtime, job)
      if (job.status === FIBER_STATE.FAILED)
        throw new Error(to_string(runtime, job.error))
      // Await reactions resume their fiber as part of the current microtask.
      for (const active of runtime.fibers)
        if (active.status === FIBER_STATE.READY) run_task(runtime, active)
    } finally {
      if (job) dispose_fiber(runtime, job)
      memory.free_root(callee)
      memory.free_root(value)
    }
  }
}
export async function wait_for_completion(runtime: Runtime) {
  if (
    runtime.scheduler.completions.length !== 0 ||
    runtime.scheduler.has_jobs()
  )
    return
  await new Promise<void>((resolve) => {
    runtime.scheduler.wake = resolve
  })
}
