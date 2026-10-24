import { alloc_root, free_root, copy_value } from "../vm/memory.js"
import {
  get_ref,
  write_string,
  write_number,
  write_boolean,
} from "../vm/values.js"
import {
  create_function,
  create_value_array,
  create_error,
  kind_of,
  to_string,
} from "../vm/objects.js"
import { KINDS } from "../vm/memory.js"
import { RESUME_CODE } from "../vm/intrinsics.js"
import {
  create_call_context,
  run_task,
  context_status,
  context_error,
  dispose_context,
  resume_context,
} from "../vm/interpreter.js"

export const CONTEXT_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
const RECORD_BYTES = 16

export function create_scheduler() {
  return {
    control: new Uint8Array(32),
    jobs: new Uint8Array(RECORD_BYTES * 16),
    operations: new Uint8Array(RECORD_BYTES * 16),
    // Host completions contain text/errors and numeric operation IDs only.
    completions: [],
    wake: null,
  }
}
function control(scheduler) {
  return new DataView(scheduler.control.buffer)
}
function grow(scheduler, field, required) {
  if (required <= scheduler[field].length) return
  const bytes = new Uint8Array(Math.max(required, scheduler[field].length * 2))
  bytes.set(scheduler[field])
  scheduler[field] = bytes
}
function notify(runtime) {
  const wake = runtime.scheduler.wake
  runtime.scheduler.wake = null
  if (wake) wake()
}

export function enqueue_job(runtime, callee, argument) {
  const { memory, scheduler } = runtime
  if (callee === undefined || kind_of(memory, callee) !== KINDS.FUNCTION)
    throw new TypeError("Job is not callable")
  const fn = alloc_root(memory),
    value = alloc_root(memory)
  copy_value(memory, fn, callee)
  if (argument !== undefined) copy_value(memory, value, argument)
  const index = control(scheduler).getUint32(4, true)
  grow(scheduler, "jobs", (index + 1) * RECORD_BYTES)
  const view = new DataView(scheduler.jobs.buffer)
  view.setUint32(index * RECORD_BYTES, fn, true)
  view.setUint32(index * RECORD_BYTES + 4, value, true)
  view.setUint32(index * RECORD_BYTES + 8, argument === undefined ? 0 : 1, true)
  control(scheduler).setUint32(4, index + 1, true)
  notify(runtime)
}

function resume_function(runtime, destination, context, register, rejected) {
  const { memory } = runtime
  const target = alloc_root(memory),
    flag = alloc_root(memory),
    captured = alloc_root(memory)
  try {
    write_number(memory, target, register)
    write_boolean(memory, flag, rejected)
    create_value_array(memory, captured, [target, flag])
    create_function(memory, destination, RESUME_CODE, context.id, captured, 2)
  } finally {
    for (const root of [target, flag, captured]) free_root(memory, root)
  }
}

export function await_value(runtime, context, destination, source) {
  if (runtime.promise_await === undefined)
    throw new Error("Promise is not initialized")
  const { memory } = runtime
  const fulfilled = alloc_root(memory),
    rejected = alloc_root(memory)
  new DataView(context.control.buffer).setUint32(0, CONTEXT_STATE.WAITING, true)
  if (context.module_state)
    new DataView(context.module_state.buffer).setUint32(0, 3, true)
  let registration
  try {
    resume_function(runtime, fulfilled, context, destination, false)
    resume_function(runtime, rejected, context, destination, true)
    registration = create_call_context(
      runtime,
      runtime.promise_await,
      undefined,
      [source, fulfilled, rejected],
    )
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

export function start_read(runtime, path, encoding, resolve, reject) {
  const { memory, scheduler } = runtime
  if (
    resolve === undefined ||
    reject === undefined ||
    kind_of(memory, resolve) !== KINDS.FUNCTION ||
    kind_of(memory, reject) !== KINDS.FUNCTION
  )
    throw new TypeError("read_file requires resolve and reject callbacks")
  const resolve_root = alloc_root(memory),
    reject_root = alloc_root(memory)
  copy_value(memory, resolve_root, resolve)
  copy_value(memory, reject_root, reject)
  const id = control(scheduler).getUint32(8, true)
  control(scheduler).setUint32(8, id + 1, true)
  control(scheduler).setUint32(12, pending_operations(runtime) + 1, true)
  grow(scheduler, "operations", (id + 1) * RECORD_BYTES)
  const operations = new DataView(scheduler.operations.buffer)
  operations.setUint32(id * RECORD_BYTES, 1, true)
  operations.setUint32(id * RECORD_BYTES + 4, resolve_root, true)
  operations.setUint32(id * RECORD_BYTES + 8, reject_root, true)
  Promise.resolve()
    .then(() => runtime.host.read_text(path, encoding))
    .then(
      (text) => {
        scheduler.completions.push({ id, text })
        notify(runtime)
      },
      (error) => {
        scheduler.completions.push({ id, error, rejected: true })
        notify(runtime)
      },
    )
}

export function drain_completions(runtime) {
  const { memory, scheduler } = runtime
  for (const completion of scheduler.completions.splice(0)) {
    const offset = completion.id * RECORD_BYTES
    const operations = new DataView(scheduler.operations.buffer)
    const resolve = operations.getUint32(offset + 4, true),
      reject = operations.getUint32(offset + 8, true)
    const value = alloc_root(memory)
    try {
      if (completion.rejected)
        create_error(
          runtime,
          value,
          "Error",
          String(completion.error?.message ?? completion.error),
        )
      else write_string(memory, value, completion.text)
      enqueue_job(runtime, completion.rejected ? reject : resolve, value)
    } finally {
      free_root(memory, value)
      free_root(memory, resolve)
      free_root(memory, reject)
      new DataView(scheduler.operations.buffer).setUint32(offset, 0, true)
      control(scheduler).setUint32(12, pending_operations(runtime) - 1, true)
    }
  }
}

export function drain_jobs(runtime) {
  const { memory, scheduler } = runtime
  while (
    control(scheduler).getUint32(0, true) <
    control(scheduler).getUint32(4, true)
  ) {
    const index = control(scheduler).getUint32(0, true),
      view = new DataView(scheduler.jobs.buffer),
      offset = index * RECORD_BYTES
    const callee = view.getUint32(offset, true),
      value = view.getUint32(offset + 4, true),
      argc = view.getUint32(offset + 8, true)
    // Remove before executing: jobs may enqueue, grow, or start a new empty queue.
    const next = index + 1
    if (next === control(scheduler).getUint32(4, true)) {
      control(scheduler).setUint32(0, 0, true)
      control(scheduler).setUint32(4, 0, true)
    } else control(scheduler).setUint32(0, next, true)
    let job
    try {
      job = create_call_context(runtime, callee, undefined, argc ? [value] : [])
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
export function pending_operations(runtime) {
  return control(runtime.scheduler).getUint32(12, true)
}
export async function wait_for_completion(runtime) {
  if (
    runtime.scheduler.completions.length !== 0 ||
    control(runtime.scheduler).getUint32(4, true) !== 0
  )
    return
  await new Promise((resolve) => {
    runtime.scheduler.wake = resolve
  })
}
