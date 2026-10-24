import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { alloc_root, create_memory, free_root } from "../vm/memory.js"
import { collect, heap_stats } from "../vm/heap.js"
import { read_string, write_string } from "../vm/values.js"
import { create_object, get_property, set_property } from "../vm/objects.js"
import { bootstrap } from "../runtime/bootstrap.js"
import {
  create_runtime,
  evaluate_module,
  load_module,
} from "../runtime/modules.js"
import {
  CONTEXT_STATE,
  await_value,
  create_promise,
  create_scheduler,
  drain_completions,
  drain_jobs,
  pending_operations,
  settle_promise,
  start_read,
  wait_for_completion,
} from "../runtime/jobs.js"

function scheduler_runtime(host = {}) {
  return {
    memory: create_memory({ semispace_bytes: 4096, root_capacity: 2 }),
    scheduler: create_scheduler(),
    contexts: [],
    host,
  }
}

// These contexts contain the same byte control fields used by the interpreter.
// Scheduler tests isolate guest-value lifetimes from compilation and linking.
function scheduler_context(runtime) {
  const context = {
    id: runtime.contexts.length,
    control: new Uint8Array(32),
  }
  const destination = alloc_root(runtime.memory)
  const error = alloc_root(runtime.memory)
  new DataView(context.control.buffer).setUint32(16, error, true)
  runtime.contexts.push(context)
  return { context, destination, error }
}

function status(context) {
  return new DataView(context.control.buffer).getUint32(0, true)
}

test("property creation re-reads object and value roots after allocation collects", () => {
  const memory = create_memory({ semispace_bytes: 128 })
  const object = alloc_root(memory)
  const key = alloc_root(memory)
  const value = alloc_root(memory)
  const garbage = alloc_root(memory)
  create_object(memory, object)
  write_string(memory, key, "key")
  write_string(memory, value, "value")
  write_string(memory, garbage, "abcdefghijklmnopqrst")
  free_root(memory, garbage)
  assert.equal(heap_stats(memory).collections, 0)
  set_property(memory, object, key, value)
  assert.equal(heap_stats(memory).collections, 1)
  get_property(memory, value, object, key)
  assert.equal(read_string(memory, value), "value")
  collect(memory)
  get_property(memory, value, object, key)
  assert.equal(read_string(memory, value), "value")
})

for (const rejected of [false, true]) {
  test(`host ${rejected ? "rejection" : "fulfillment"} survives collection while suspended and queued`, async () => {
    let finish
    const runtime = scheduler_runtime({
      read_text: () =>
        new Promise((resolve, reject) => {
          finish = rejected ? reject : resolve
        }),
    })
    const { memory } = runtime
    const { context, destination, error } = scheduler_context(runtime)
    const promise = alloc_root(memory)
    start_read(runtime, promise, "fixture", "utf8")
    await_value(runtime, context, destination, promise)
    free_root(memory, promise)
    assert.equal(status(context), CONTEXT_STATE.WAITING)
    assert.equal(pending_operations(runtime), 1)
    collect(memory)
    await Promise.resolve()
    finish(rejected ? new Error("read failed") : "file contents")
    await wait_for_completion(runtime)
    collect(memory)
    drain_completions(runtime)
    assert.equal(pending_operations(runtime), 0)
    assert.equal(heap_stats(memory).roots, 3) // destination, error, queued value
    collect(memory)
    drain_jobs(runtime)
    assert.equal(
      status(context),
      rejected ? CONTEXT_STATE.FAILED : CONTEXT_STATE.READY,
    )
    assert.equal(
      read_string(memory, rejected ? error : destination),
      rejected ? "read failed" : "file contents",
    )
    assert.equal(heap_stats(memory).roots, 2)
    free_root(memory, destination)
    free_root(memory, error)
    collect(memory)
    assert.equal(heap_stats(memory).used_bytes, 0)
  })
}

test("settled Promise result is rooted by its resume job after callers release it", () => {
  const runtime = scheduler_runtime()
  const { memory } = runtime
  const { context, destination, error } = scheduler_context(runtime)
  const promise = alloc_root(memory)
  const value = alloc_root(memory)
  create_promise(runtime, promise)
  write_string(memory, value, "already settled")
  settle_promise(runtime, promise, value)
  await_value(runtime, context, destination, promise)
  free_root(memory, promise)
  free_root(memory, value)
  collect(memory)
  drain_jobs(runtime)
  assert.equal(read_string(memory, destination), "already settled")
  free_root(memory, destination)
  free_root(memory, error)
  collect(memory)
  assert.equal(heap_stats(memory).roots, 0)
  assert.equal(heap_stats(memory).used_bytes, 0)
})

test("resume jobs retain values across queue and root table growth", () => {
  const runtime = scheduler_runtime()
  const { memory } = runtime
  const contexts = []
  for (let index = 0; index < 24; index++) {
    const current = scheduler_context(runtime)
    const value = alloc_root(memory)
    write_string(memory, value, `job ${index}`)
    await_value(runtime, current.context, current.destination, value)
    free_root(memory, value)
    contexts.push(current)
    collect(memory)
  }
  drain_jobs(runtime)
  for (let index = 0; index < contexts.length; index++) {
    const { context, destination, error } = contexts[index]
    assert.equal(status(context), CONTEXT_STATE.READY)
    assert.equal(read_string(memory, destination), `job ${index}`)
    free_root(memory, destination)
    free_root(memory, error)
  }
  collect(memory)
  assert.equal(heap_stats(memory).roots, 0)
  assert.equal(heap_stats(memory).used_bytes, 0)
})

test("guest closures survive repeated calls and allocation-triggered collection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "djs-gc-"))
  try {
    const path = join(directory, "closure.js")
    await writeFile(
      path,
      `
      function make_counter(start) {
        let value = start;
        return function() {
          value = value + 1;
          return { value: value, text: "item" + value };
        };
      }
      const next = make_counter(10);
      let index = 0;
      let current;
      while (index < 1000) {
        current = next();
        index = index + 1;
      }
      console.log(current.text, next().value);
    `,
    )
    let output = ""
    const runtime = create_runtime({
      semispace_bytes: 4096,
      root_capacity: 2,
      host: {
        read_text: readFile,
        write_stdout: (text) => {
          output += text
        },
      },
    })
    await bootstrap(runtime)
    const module = await load_module(runtime, pathToFileURL(path).href)
    const roots_before = heap_stats(runtime.memory).roots
    await evaluate_module(runtime, module)
    assert.equal(output, "item1010 1011\n")
    assert.ok(heap_stats(runtime.memory).collections > 10)
    assert.equal(heap_stats(runtime.memory).roots, roots_before)
    collect(runtime.memory)
    assert.ok(heap_stats(runtime.memory).used_bytes < 3072)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test(
  "guest import and await retain suspended closure state through moving GC",
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "djs-await-gc-"))
    try {
      const path = join(directory, "await.js")
      await writeFile(
        path,
        `
      import fs from "node:fs/promises";
      function make_reader(prefix) {
        return function(text) { return prefix + text; };
      }
      const format = make_reader("read: ");
      const text = await fs.readFile("/pending-data", "utf8");
      console.log(format(text));
    `,
      )
      let finish
      let started
      const read_started = new Promise((resolve) => {
        started = resolve
      })
      let output = ""
      const runtime = create_runtime({
        semispace_bytes: 4096,
        root_capacity: 2,
        host: {
          read_text: (requested, encoding) => {
            if (requested !== "/pending-data")
              return readFile(requested, encoding)
            started()
            return new Promise((resolve) => {
              finish = resolve
            })
          },
          write_stdout: (text) => {
            output += text
          },
        },
      })
      await bootstrap(runtime)
      const module = await load_module(runtime, pathToFileURL(path).href)
      const roots_before = heap_stats(runtime.memory).roots
      const evaluation = evaluate_module(runtime, module)
      await Promise.race([
        read_started,
        evaluation.then(() => {
          throw new Error("Guest did not start file read")
        }),
      ])
      assert.equal(pending_operations(runtime), 1)
      assert.ok(
        runtime.contexts.some(
          (context) => context && status(context) === CONTEXT_STATE.WAITING,
        ),
      )
      collect(runtime.memory)
      collect(runtime.memory)
      assert.equal(output, "")
      finish("contents")
      await evaluation
      assert.equal(output, "read: contents\n")
      assert.equal(pending_operations(runtime), 0)
      assert.equal(heap_stats(runtime.memory).roots, roots_before)
      collect(runtime.memory)
      assert.ok(heap_stats(runtime.memory).used_bytes < 3072)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
