import {
  KINDS,
  alloc_root,
  free_root,
  copy_value,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
  read_u32,
  write_u32,
} from "../vm/memory.js"
import { allocate } from "../vm/heap.js"
import { get_ref, set_ref, write_string } from "../vm/values.js"
import { kind_of } from "../vm/objects.js"

export const PROMISE_STATE = Object.freeze({
  PENDING: 0,
  FULFILLED: 1,
  REJECTED: 2,
})
export const CONTEXT_STATE = Object.freeze({
  READY: 0,
  RUNNING: 1,
  WAITING: 2,
  DONE: 3,
  FAILED: 4,
  DISPOSED: 5,
})
const RECORD_BYTES = 24

export function create_scheduler() {
  return {
    control: new Uint8Array(32),
    reactions: new Uint8Array(RECORD_BYTES * 16),
    jobs: new Uint8Array(RECORD_BYTES * 16),
    operations: new Uint8Array(8 * 16),
    // External completions contain host text/errors, never unrooted guest values.
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

export function create_promise(runtime, destination) {
  set_ref(
    runtime.memory,
    destination,
    allocate(runtime.memory, KINDS.PROMISE, 16),
  )
}

function queue_resume(runtime, context_id, destination, argument, rejected) {
  const { memory, scheduler } = runtime
  const value = alloc_root(memory)
  copy_value(memory, value, argument)
  const index = control(scheduler).getUint32(4, true)
  grow(scheduler, "jobs", (index + 1) * RECORD_BYTES)
  const view = new DataView(scheduler.jobs.buffer)
  view.setUint32(index * RECORD_BYTES, context_id, true)
  view.setUint32(index * RECORD_BYTES + 4, destination, true)
  view.setUint32(index * RECORD_BYTES + 8, value, true)
  view.setUint32(index * RECORD_BYTES + 12, rejected ? 1 : 0, true)
  control(scheduler).setUint32(4, index + 1, true)
  notify(runtime)
}

export function settle_promise(runtime, promise, argument, rejected = false) {
  const { memory, scheduler } = runtime
  if (kind_of(memory, promise) !== KINDS.PROMISE)
    throw new TypeError("Expected a guest Promise")
  const reference = get_ref(memory, promise)
  if (read_u32(memory, reference + 8) !== PROMISE_STATE.PENDING) return
  write_u32(
    memory,
    reference + 8,
    rejected ? PROMISE_STATE.REJECTED : PROMISE_STATE.FULFILLED,
  )
  copy_root_to_heap_value(memory, reference + 16, argument)
  const view = new DataView(scheduler.reactions.buffer)
  for (
    let offset = 0;
    offset < scheduler.reactions.length;
    offset += RECORD_BYTES
  ) {
    if (view.getUint32(offset, true) === 0) continue
    const promise_root = view.getUint32(offset + 4, true)
    if (get_ref(memory, promise_root) !== reference) continue
    queue_resume(
      runtime,
      view.getUint32(offset + 8, true),
      view.getUint32(offset + 12, true),
      argument,
      rejected,
    )
    free_root(memory, promise_root)
    view.setUint32(offset, 0, true)
  }
}

export function await_value(runtime, context, destination, source) {
  const { memory, scheduler } = runtime
  new DataView(context.control.buffer).setUint32(0, CONTEXT_STATE.WAITING, true)
  if (context.module_state)
    new DataView(context.module_state.buffer).setUint32(0, 3, true) // awaiting
  if (kind_of(memory, source) !== KINDS.PROMISE) {
    queue_resume(runtime, context.id, destination, source, false)
    return
  }
  const reference = get_ref(memory, source)
  const state = read_u32(memory, reference + 8)
  if (state !== PROMISE_STATE.PENDING) {
    const value = alloc_root(memory)
    try {
      copy_heap_value_to_root(memory, value, reference + 16)
      queue_resume(
        runtime,
        context.id,
        destination,
        value,
        state === PROMISE_STATE.REJECTED,
      )
    } finally {
      free_root(memory, value)
    }
    return
  }
  let offset = 0
  const initial = new DataView(scheduler.reactions.buffer)
  while (
    offset < scheduler.reactions.length &&
    initial.getUint32(offset, true) !== 0
  )
    offset += RECORD_BYTES
  grow(scheduler, "reactions", offset + RECORD_BYTES)
  const view = new DataView(scheduler.reactions.buffer)
  const promise_root = alloc_root(memory)
  copy_value(memory, promise_root, source)
  view.setUint32(offset, 1, true)
  view.setUint32(offset + 4, promise_root, true)
  view.setUint32(offset + 8, context.id, true)
  view.setUint32(offset + 12, destination, true)
}

export function start_read(runtime, destination, path, encoding) {
  const { memory, scheduler } = runtime
  create_promise(runtime, destination)
  const promise_root = alloc_root(memory)
  copy_value(memory, promise_root, destination)
  const id = control(scheduler).getUint32(8, true)
  control(scheduler).setUint32(8, id + 1, true)
  control(scheduler).setUint32(
    12,
    control(scheduler).getUint32(12, true) + 1,
    true,
  )
  grow(scheduler, "operations", (id + 1) * 8)
  const operations = new DataView(scheduler.operations.buffer)
  operations.setUint32(id * 8, 1, true)
  operations.setUint32(id * 8 + 4, promise_root, true)
  Promise.resolve()
    .then(() => runtime.host.read_text(path, encoding))
    .then(
      (text) => {
        scheduler.completions.push({ id, text })
        notify(runtime)
      },
      (error) => {
        scheduler.completions.push({ id, error })
        notify(runtime)
      },
    )
}

export function drain_completions(runtime) {
  const { memory, scheduler } = runtime
  for (const completion of scheduler.completions.splice(0)) {
    const operations = new DataView(scheduler.operations.buffer)
    const root = operations.getUint32(completion.id * 8 + 4, true)
    const argument = alloc_root(memory)
    try {
      write_string(
        memory,
        argument,
        completion.error
          ? String(completion.error.message ?? completion.error)
          : completion.text,
      )
      settle_promise(runtime, root, argument, Boolean(completion.error))
    } finally {
      free_root(memory, argument)
      free_root(memory, root)
      operations.setUint32(completion.id * 8, 0, true)
      control(scheduler).setUint32(
        12,
        control(scheduler).getUint32(12, true) - 1,
        true,
      )
    }
  }
}

export function drain_jobs(runtime) {
  const { memory, scheduler } = runtime
  const view = new DataView(scheduler.jobs.buffer)
  const count = control(scheduler).getUint32(4, true)
  for (let index = 0; index < count; index++) {
    const offset = index * RECORD_BYTES
    const context = runtime.contexts[view.getUint32(offset, true)]
    const destination = view.getUint32(offset + 4, true)
    const argument = view.getUint32(offset + 8, true)
    const rejected = view.getUint32(offset + 12, true) !== 0
    const context_view = new DataView(context.control.buffer)
    if (context_view.getUint32(0, true) === CONTEXT_STATE.WAITING) {
      if (rejected) {
        copy_value(memory, context_view.getUint32(16, true), argument)
        context_view.setUint32(0, CONTEXT_STATE.FAILED, true)
      } else {
        copy_value(memory, destination, argument)
        context_view.setUint32(0, CONTEXT_STATE.READY, true)
      }
    }
    free_root(memory, argument)
  }
  control(scheduler).setUint32(4, 0, true)
}

export function pending_operations(runtime) {
  return control(runtime.scheduler).getUint32(12, true)
}

export async function wait_for_completion(runtime) {
  if (runtime.scheduler.completions.length !== 0) return
  await new Promise((resolve) => {
    runtime.scheduler.wake = resolve
  })
}
