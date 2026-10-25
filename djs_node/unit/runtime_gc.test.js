import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Memory } from "../vm/memory.ts"
import { CONTEXT_STATE } from "../vm/context.ts"
import { collect, heap_stats } from "../vm/heap.ts"
import { read_number, read_string, write_string } from "../vm/values.ts"
import {
  create_arguments_object,
  create_object,
  get_property,
  set_property,
} from "../vm/objects.ts"
import { bootstrap } from "../runtime/bootstrap.ts"
import { Runtime, evaluate_module, load_module } from "../runtime/modules.ts"
import {
  create_scheduler,
  enqueue_job,
  drain_jobs,
  pending_operations,
} from "../runtime/jobs.ts"
import { create_function } from "../vm/objects.ts"
import { NATIVE_CODE, intrinsic_id } from "../vm/intrinsics.ts"

test("property creation re-reads object and value roots after allocation collects", () => {
  const memory = new Memory({ semispace_bytes: 128 })
  const object = memory.alloc_root()
  const key = memory.alloc_root()
  const value = memory.alloc_root()
  const garbage = memory.alloc_root()
  const setter = memory.alloc_root()
  create_object(memory, object)
  write_string(memory, key, "key")
  write_string(memory, value, "value")
  write_string(memory, garbage, "abcdefghijklmnopqrst")
  memory.free_root(garbage)
  assert.equal(heap_stats(memory).collections, 0)
  set_property({ memory }, setter, object, key, value)
  assert.equal(heap_stats(memory).collections, 1)
  get_property(memory, value, object, key)
  assert.equal(read_string(memory, value), "value")
  collect(memory)
  get_property(memory, value, object, key)
  assert.equal(read_string(memory, value), "value")
})

test("queued callbacks retain functions and arguments across collection and queue growth", () => {
  let output = ""
  const runtime = {
    memory: new Memory({ semispace_bytes: 16384, root_capacity: 2 }),
    scheduler: create_scheduler(),
    contexts: [],
    host: {
      write_stdout: (text) => {
        output += text
      },
    },
  }
  const { memory } = runtime
  const fn = memory.alloc_root(),
    argument = memory.alloc_root()
  create_function(memory, fn, NATIVE_CODE, intrinsic_id("write_stdout"))
  for (let index = 0; index < 40; index++) {
    write_string(memory, argument, `job ${index}\n`)
    enqueue_job(runtime, fn, argument)
    collect(memory)
  }
  memory.free_root(fn)
  memory.free_root(argument)
  collect(memory)
  drain_jobs(runtime)
  assert.equal(
    output,
    Array.from({ length: 40 }, (_, i) => `job ${i}\n`).join(""),
  )
  collect(memory)
  assert.equal(heap_stats(memory).roots, 0)
  assert.equal(heap_stats(memory).used_bytes, 0)
})

test("arguments objects retain indexed values through allocation-triggered collection", () => {
  const memory = new Memory({ semispace_bytes: 1024, root_capacity: 2 })
  const args = memory.alloc_root(),
    key = memory.alloc_root(),
    value = memory.alloc_root(),
    first = memory.alloc_root(),
    second = memory.alloc_root()
  try {
    write_string(memory, first, "first")
    write_string(memory, second, "second")
    for (let index = 0; index < 40; index++) {
      create_arguments_object(memory, args, [first, second])
      write_string(memory, key, "length")
      get_property(memory, value, args, key)
      assert.equal(read_number(memory, value), 2)
      write_string(memory, key, "0")
      get_property(memory, value, args, key)
      assert.equal(read_string(memory, value), "first")
      write_string(memory, key, "1")
      get_property(memory, value, args, key)
      assert.equal(read_string(memory, value), "second")
    }
    assert.ok(heap_stats(memory).collections > 2)
  } finally {
    for (const root of [args, key, value, first, second]) memory.free_root(root)
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
      while (index < 3000) {
        current = next();
        index = index + 1;
      }
      console.log(current.text, next().value);
    `,
    )
    let output = ""
    const runtime = new Runtime({
      // Include the standard name/length properties now owned by guest functions.
      semispace_bytes: 65536,
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
    collect(runtime.memory)
    const bytes_before = heap_stats(runtime.memory).used_bytes
    await evaluate_module(runtime, module)
    assert.equal(output, "item3010 3011\n")
    assert.ok(heap_stats(runtime.memory).collections > 10)
    assert.equal(heap_stats(runtime.memory).roots, roots_before)
    collect(runtime.memory)
    assert.ok(heap_stats(runtime.memory).used_bytes < bytes_before + 4096)
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
      let reads = 0
      let closed = false
      const runtime = new Runtime({
        semispace_bytes: 65536,
        root_capacity: 2,
        host: {
          read_text: readFile,
          open: (path) => {
            assert.equal(path, "/pending-data")
            return 1
          },
          read: () => {
            if (reads++ > 0) return new Uint8Array()
            started()
            return new Promise((resolve) => {
              finish = resolve
            })
          },
          close: () => {
            closed = true
          },
          write_stdout: (text) => {
            output += text
          },
        },
      })
      await bootstrap(runtime)
      const module = await load_module(runtime, pathToFileURL(path).href)
      const roots_before = heap_stats(runtime.memory).roots
      collect(runtime.memory)
      const bytes_before = heap_stats(runtime.memory).used_bytes
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
          (context) => context && context.status === CONTEXT_STATE.WAITING,
        ),
      )
      collect(runtime.memory)
      collect(runtime.memory)
      assert.equal(output, "")
      finish(new TextEncoder().encode("contents"))
      await evaluation
      assert.equal(output, "read: contents\n")
      assert.equal(pending_operations(runtime), 0)
      assert.equal(closed, true)
      assert.equal(heap_stats(runtime.memory).roots, roots_before)
      collect(runtime.memory)
      assert.ok(heap_stats(runtime.memory).used_bytes < bytes_before + 4096)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

for (const rejected of [false, true]) {
  test(`host ${rejected ? "rejection" : "fulfillment"} retains guest callbacks while suspended`, async () => {
    let finish, started
    const began = new Promise((resolve) => {
      started = resolve
    })
    let output = ""
    let reads = 0
    let closed = false
    const source = `
      import { readFile } from "node:fs/promises";
      try { console.log(await readFile("/pending", "utf8")); }
      catch (error) { console.log(error.name, error.message, error instanceof Error); }
      finally { console.log("finished"); }
    `
    const runtime = new Runtime({
      semispace_bytes: 65536,
      root_capacity: 2,
      host: {
        read_text: (path, encoding) => {
          if (path === "/entry") return source
          return readFile(path, encoding)
        },
        open: (path) => {
          assert.equal(path, "/pending")
          return 1
        },
        read: () => {
          if (reads++ > 0) return new Uint8Array()
          started()
          return new Promise((resolve, reject) => {
            finish = rejected ? reject : resolve
          })
        },
        close: () => {
          closed = true
        },
        write_stdout: (text) => {
          output += text
        },
      },
    })
    await bootstrap(runtime)
    const module = await load_module(runtime, "file:///entry")
    const roots = heap_stats(runtime.memory).roots
    const evaluation = evaluate_module(runtime, module)
    await began
    assert.equal(pending_operations(runtime), 1)
    collect(runtime.memory)
    collect(runtime.memory)
    finish(
      rejected
        ? new Error("read failed")
        : new TextEncoder().encode("contents"),
    )
    await evaluation
    assert.equal(
      output,
      rejected ? "Error read failed true\nfinished\n" : "contents\nfinished\n",
    )
    assert.equal(pending_operations(runtime), 0)
    assert.equal(closed, true)
    assert.equal(heap_stats(runtime.memory).roots, roots)
  })
}
