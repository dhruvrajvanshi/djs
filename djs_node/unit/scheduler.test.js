import test from "node:test"
import assert from "node:assert/strict"
import { Memory } from "../vm/memory.ts"
import {
  create_scheduler,
  scheduler_enqueue_job,
  scheduler_take_job,
  scheduler_has_jobs,
  scheduler_allocate_operation,
  scheduler_operation,
  scheduler_release_operation,
  scheduler_pending_operations,
  scheduler_increment_task_steps,
  scheduler_reset_task_steps,
} from "../runtime/scheduler.ts"

test("jobs retain FIFO order through partial drains, growth and queue restart", () => {
  const memory = new Memory()
  const scheduler = create_scheduler()
  const jobs = Array.from({ length: 48 }, (_, index) => ({
    callee: memory.alloc_root(),
    value: memory.alloc_root(),
    has_argument: index % 2 === 0,
  }))
  for (const job of jobs.slice(0, 16)) scheduler_enqueue_job(scheduler, job)
  for (const job of jobs.slice(0, 8))
    assert.deepEqual(scheduler_take_job(scheduler), job)
  for (const job of jobs.slice(16)) scheduler_enqueue_job(scheduler, job)
  for (const job of jobs.slice(8))
    assert.deepEqual(scheduler_take_job(scheduler), job)
  assert.equal(scheduler_has_jobs(scheduler), false)
  assert.equal(scheduler_take_job(scheduler), null)
  scheduler_enqueue_job(scheduler, jobs[0])
  assert.deepEqual(scheduler_take_job(scheduler), jobs[0])
  assert.equal(scheduler_has_jobs(scheduler), false)
})

test("operation reuse preserves active records, optional root zero and task budgets", () => {
  const memory = new Memory()
  const scheduler = create_scheduler()
  const buffer = memory.alloc_root()
  assert.equal(buffer, 0)
  const operations = Array.from({ length: 40 }, (_, index) => ({
    resolve: memory.alloc_root(),
    reject: memory.alloc_root(),
    buffer: index % 2 === 0 ? buffer : null,
    offset: index * 3,
    length: index + 1,
  }))
  const ids = operations.map((operation) =>
    scheduler_allocate_operation(scheduler, operation),
  )
  assert.equal(new Set(ids).size, operations.length)
  assert.equal(scheduler_pending_operations(scheduler), operations.length)
  for (const index of [0, 12, 39])
    scheduler_release_operation(scheduler, ids[index])
  const replacements = [39, 12, 0].map((index) => {
    const id = scheduler_allocate_operation(scheduler, operations[1])
    assert.equal(id, ids[index])
    operations[index] = operations[1]
    return id
  })
  assert.equal(new Set(replacements).size, 3)
  for (const [index, id] of ids.entries()) {
    assert.deepEqual(scheduler_operation(scheduler, id), operations[index])
    scheduler_release_operation(scheduler, id)
  }
  assert.equal(scheduler_pending_operations(scheduler), 0)
  assert.equal(scheduler_increment_task_steps(scheduler), 1)
  assert.equal(scheduler_increment_task_steps(scheduler), 2)
  scheduler_reset_task_steps(scheduler)
  assert.equal(scheduler_increment_task_steps(scheduler), 1)
})
