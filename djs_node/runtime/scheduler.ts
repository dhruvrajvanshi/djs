import { heap_type_of, write_number } from "../vm/storage/value.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import type { Runtime } from "./runtime.ts"
import type { HostError } from "../host/node.ts"
import { byte_buffer_view } from "../vm/heap_types/byte_buffer.ts"
import { create_error } from "../vm/errors.ts"
import { define_property } from "../vm/properties.ts"
import { create_object } from "../vm/objects.ts"
import { write_primitive } from "../vm/operations.ts"
import { error_report } from "./error_report.ts"
import { FIBER_STATE } from "../vm/fiber.ts"
import { create_call_fiber, dispose_fiber } from "../vm/calls.ts"
import { run_task } from "../vm/interpreter.ts"
import { panic } from "../utils.ts"
import type { Handle, Persistent } from "../vm/storage/heap.ts"

export interface Completion {
  id: number
  result?: unknown
  error?: HostError
  rejected?: boolean
  syscall?: string
  path?: string
}

/** Whoever takes a job or completes an operation releases its handles. */
export interface Job {
  callee: Persistent
  value: Persistent
  has_argument: boolean
}

export interface Operation {
  resolve: Persistent
  reject: Persistent
  buffer: Persistent | null
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

  /** Caller must release the operation's handles first. */
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

export function enqueue_job(
  runtime: Runtime,
  callee: Handle,
  argument?: Handle,
) {
  const { heap, scheduler } = runtime
  if (
    callee === undefined ||
    heap_type_of(heap, callee) !== HEAP_TYPES.FUNCTION
  )
    panic("Job is not callable")
  const fn = heap.handles.persistent(),
    value = heap.handles.persistent()
  heap.copy_value(fn, callee)
  if (argument !== undefined) heap.copy_value(value, argument)
  scheduler.enqueue_job({
    callee: fn,
    value,
    has_argument: argument !== undefined,
  })
  notify(runtime)
}

export interface OperationOptions {
  buffer?: Handle
  offset?: number
  length?: number
  syscall?: string
  path?: string
}

export function start_operation(
  runtime: Runtime,
  resolve: Handle,
  reject: Handle,
  begin: () => unknown | PromiseLike<unknown>,
  { buffer, offset = 0, length = 0, syscall, path }: OperationOptions = {},
) {
  const { heap, scheduler } = runtime
  if (
    resolve === undefined ||
    reject === undefined ||
    heap_type_of(heap, resolve) !== HEAP_TYPES.FUNCTION ||
    heap_type_of(heap, reject) !== HEAP_TYPES.FUNCTION
  )
    panic("I/O operation requires resolve and reject callbacks")
  const operation = {
    resolve: heap.handles.persistent(),
    reject: heap.handles.persistent(),
    buffer: buffer === undefined ? null : heap.handles.persistent(),
    offset,
    length,
  }
  heap.copy_value(operation.resolve, resolve)
  heap.copy_value(operation.reject, reject)
  if (buffer !== undefined && operation.buffer !== null)
    heap.copy_value(operation.buffer, buffer)
  const id = scheduler.allocate_operation(operation)
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

export function operation_error(
  runtime: Runtime,
  destination: Handle,
  error: HostError,
  syscall?: string,
  path?: string,
) {
  const { heap } = runtime
  create_error(runtime, destination, "Error", String(error?.message ?? error))
  heap.handles.scope(() => {
    const value = heap.handles.local()
    for (const [name, item] of Object.entries({
      code: error?.code,
      syscall,
      path,
    })) {
      if (item === undefined) continue
      write_primitive(runtime, value, item)
      define_property(runtime, destination, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  })
}

/** Host results are primitives or flat records of primitives, such as lstat's. */
export function write_host_value(
  runtime: Runtime,
  destination: Handle,
  value: unknown,
) {
  if (value === null || typeof value !== "object")
    return write_primitive(runtime, destination, value)
  const { heap } = runtime
  create_object(runtime, destination)
  heap.handles.scope(() => {
    const item = heap.handles.local()
    for (const [name, field] of Object.entries(value)) {
      write_primitive(runtime, item, field)
      define_property(runtime, destination, name, {
        value: item,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  })
}

export function drain_completions(runtime: Runtime) {
  const { heap, scheduler } = runtime
  while (scheduler.completions.length) {
    const completion = scheduler.completions.shift()!
    const { resolve, reject, buffer, offset, length } = scheduler.operation(
      completion.id,
    )
    heap.handles.scope(() => {
      const value = heap.handles.local()
      let rejected = completion.rejected
      try {
        if (rejected) throw completion.error
        if (buffer !== null) {
          const bytes = completion.result
          if (!(bytes instanceof Uint8Array) || bytes.length > length)
            throw new TypeError("Host read returned invalid bytes")
          // Resolve the buffer's address again here; it may have moved while waiting.
          byte_buffer_view(heap, buffer).set(bytes, offset)
          write_number(heap, value, bytes.length)
        } else write_host_value(runtime, value, completion.result)
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
      try {
        enqueue_job(runtime, rejected ? reject : resolve, value)
      } finally {
        heap.handles.release(resolve)
        heap.handles.release(reject)
        if (buffer !== null) heap.handles.release(buffer)
        scheduler.release_operation(completion.id)
      }
    })
  }
}

export function drain_jobs(runtime: Runtime) {
  const { heap, scheduler } = runtime
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
        throw new Error(error_report(runtime, job.error))
      // Await reactions resume their fiber as part of the current microtask.
      for (const active of runtime.fibers)
        if (active.status === FIBER_STATE.READY) run_task(runtime, active)
    } finally {
      if (job) dispose_fiber(runtime, job)
      heap.handles.release(callee)
      heap.handles.release(value)
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
