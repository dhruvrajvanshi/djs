import test from "node:test"
import assert from "node:assert/strict"
import { Memory } from "../vm/storage/memory.ts"
import { Scheduler } from "../runtime/scheduler.ts"

test("jobs retain FIFO order through partial drains, growth and queue restart", () => {
  const memory = new Memory()
  const scheduler = new Scheduler()
  const jobs = Array.from({ length: 48 }, (_, index) => ({
    callee: memory.alloc_root(),
    value: memory.alloc_root(),
    has_argument: index % 2 === 0,
  }))
  for (const job of jobs.slice(0, 16)) scheduler.enqueue_job(job)
  for (const job of jobs.slice(0, 8))
    assert.deepEqual(scheduler.take_job(), job)
  for (const job of jobs.slice(16)) scheduler.enqueue_job(job)
  for (const job of jobs.slice(8)) assert.deepEqual(scheduler.take_job(), job)
  assert.equal(scheduler.has_jobs(), false)
  assert.equal(scheduler.take_job(), null)
  scheduler.enqueue_job(jobs[0])
  assert.deepEqual(scheduler.take_job(), jobs[0])
  assert.equal(scheduler.has_jobs(), false)
})

test("operation reuse preserves active records, and optional root zero", () => {
  const memory = new Memory()
  const scheduler = new Scheduler()
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
    scheduler.allocate_operation(operation),
  )
  assert.equal(new Set(ids).size, operations.length)
  assert.equal(scheduler.pending_operations, operations.length)
  for (const index of [0, 12, 39]) scheduler.release_operation(ids[index])
  const replacements = [39, 12, 0].map((index) => {
    const id = scheduler.allocate_operation(operations[1])
    assert.equal(id, ids[index])
    operations[index] = operations[1]
    return id
  })
  assert.equal(new Set(replacements).size, 3)
  for (const [index, id] of ids.entries()) {
    assert.deepEqual(scheduler.operation(id), operations[index])
    scheduler.release_operation(id)
  }
  assert.equal(scheduler.pending_operations, 0)
})
