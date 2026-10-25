import type { Root } from "../vm/memory.ts"
import type { Runtime } from "./modules.ts"
import type { Context } from "../vm/context.ts"
import {
  context_status,
  context_set_status,
  context_error,
} from "../vm/context.ts"
import type { HostError } from "../host/node.ts"
import { alloc_root, free_root, copy_value } from "../vm/memory.ts"
import { write_string, write_number, write_boolean } from "../vm/values.ts"
import { create_error } from "../vm/completion.ts"
import {
  create_function,
  create_value_array,
  kind_of,
  to_string,
  define_property,
  write_primitive,
} from "../vm/objects.ts"
import { byte_buffer_view } from "../vm/bytes.ts"
import { KINDS } from "../vm/memory.ts"
import { panic } from "../utils.ts"
import { RESUME_CODE } from "../vm/intrinsics.ts"
import {
  create_call_context,
  run_task,
  dispose_context,
  resume_context,
} from "../vm/interpreter.ts"

import { CONTEXT_STATE } from "../vm/context.ts"
import { MODULE_STATE, module_state_set_status } from "./module-state.ts"
export { CONTEXT_STATE } from "../vm/context.ts"

import {
  scheduler_has_jobs,
  scheduler_enqueue_job,
  scheduler_take_job,
  scheduler_allocate_operation,
  scheduler_operation,
  scheduler_release_operation,
  scheduler_pending_operations,
} from "./scheduler.ts"
export { create_scheduler } from "./scheduler.ts"
export type { Scheduler, Completion } from "./scheduler.ts"

function notify(runtime: Runtime) {
  const wake = runtime.scheduler.wake
  runtime.scheduler.wake = null
  if (wake) wake()
}

export function enqueue_job(runtime: Runtime, callee: Root, argument?: Root) {
  const { memory, scheduler } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    panic("Job is not callable")
  const fn = alloc_root(memory),
    value = alloc_root(memory)
  copy_value(memory, fn, callee)
  if (argument !== undefined) copy_value(memory, value, argument)
  scheduler_enqueue_job(scheduler, {
    callee: fn,
    value,
    has_argument: argument !== undefined,
  })
  notify(runtime)
}

function resume_function(
  runtime: Runtime,
  destination: Root,
  context: Context,
  destination_root: Root,
  rejected: boolean,
) {
  const { memory } = runtime
  const target = alloc_root(memory),
    flag = alloc_root(memory),
    captured = alloc_root(memory)
  try {
    write_number(memory, target, destination_root)
    write_boolean(memory, flag, rejected)
    create_value_array(memory, captured, [target, flag])
    create_function(memory, destination, RESUME_CODE, context.id, captured, 2)
  } finally {
    for (const root of [target, flag, captured]) free_root(memory, root)
  }
}

export function await_value(
  runtime: Runtime,
  context: Context,
  destination: Root,
  source: Root,
) {
  const await_promise = runtime.intrinsics.get("AwaitPromise")
  if (await_promise === undefined) panic("Promise is not initialized")
  const { memory } = runtime
  const fulfilled = alloc_root(memory),
    rejected = alloc_root(memory)
  context_set_status(context, CONTEXT_STATE.WAITING)
  if (context.module_state)
    module_state_set_status(context.module_state, MODULE_STATE.AWAITING)
  let registration
  try {
    resume_function(runtime, fulfilled, context, destination, false)
    resume_function(runtime, rejected, context, destination, true)
    registration = create_call_context(runtime, await_promise, undefined, [
      source,
      fulfilled,
      rejected,
    ])
    run_task(runtime, registration)
    if (context_status(registration) === CONTEXT_STATE.FAILED)
      resume_context(
        runtime,
        context,
        destination,
        context_error(registration),
        true,
      )
  } finally {
    if (registration) dispose_context(runtime, registration)
    free_root(memory, fulfilled)
    free_root(memory, rejected)
  }
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
  const resolve_root = alloc_root(memory),
    reject_root = alloc_root(memory),
    buffer_root = buffer === undefined ? null : alloc_root(memory)
  copy_value(memory, resolve_root, resolve)
  copy_value(memory, reject_root, reject)
  if (buffer !== undefined && buffer_root !== null)
    copy_value(memory, buffer_root, buffer)
  const id = scheduler_allocate_operation(scheduler, {
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
  const key = alloc_root(memory),
    value = alloc_root(memory)
  try {
    for (const [name, item] of Object.entries({
      code: error?.code,
      syscall,
      path,
    })) {
      if (item === undefined) continue
      write_string(memory, key, name)
      write_primitive(memory, value, item)
      define_property(memory, destination, key, value)
    }
  } finally {
    free_root(memory, key)
    free_root(memory, value)
  }
}

export function drain_completions(runtime: Runtime) {
  const { memory, scheduler } = runtime
  while (scheduler.completions.length) {
    const completion = scheduler.completions.shift()!
    const { resolve, reject, buffer, offset, length } = scheduler_operation(
      scheduler,
      completion.id,
    )
    const value = alloc_root(memory)
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
        } else write_primitive(memory, value, completion.result)
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
      free_root(memory, value)
      free_root(memory, resolve)
      free_root(memory, reject)
      if (buffer !== null) free_root(memory, buffer)
      scheduler_release_operation(scheduler, completion.id)
    }
  }
}

export function drain_jobs(runtime: Runtime) {
  const { memory, scheduler } = runtime
  while (scheduler_has_jobs(scheduler)) {
    const { callee, value, has_argument } = scheduler_take_job(scheduler)!
    let job
    try {
      job = create_call_context(
        runtime,
        callee,
        undefined,
        has_argument ? [value] : [],
      )
      run_task(runtime, job)
      if (context_status(job) === CONTEXT_STATE.FAILED)
        throw new Error(to_string(memory, context_error(job)))
      // Await reactions resume their context as part of the current microtask.
      for (const active of runtime.contexts)
        if (context_status(active) === CONTEXT_STATE.READY)
          run_task(runtime, active)
    } finally {
      if (job) dispose_context(runtime, job)
      free_root(memory, callee)
      free_root(memory, value)
    }
  }
}
export function pending_operations(runtime: Runtime) {
  return scheduler_pending_operations(runtime.scheduler)
}
export async function wait_for_completion(runtime: Runtime) {
  if (
    runtime.scheduler.completions.length !== 0 ||
    scheduler_has_jobs(runtime.scheduler)
  )
    return
  await new Promise<void>((resolve) => {
    runtime.scheduler.wake = resolve
  })
}
