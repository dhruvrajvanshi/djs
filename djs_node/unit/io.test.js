import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { bootstrap } from "../runtime/bootstrap.js"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.js"
import { create_node_host } from "../host/node.js"
import { collect, heap_stats } from "../vm/heap.js"
import { alloc_root, free_root } from "../vm/memory.js"
import { create_function } from "../vm/objects.js"
import { NATIVE_CODE, intrinsic_id } from "../vm/intrinsics.js"
import {
  start_operation,
  drain_completions,
  drain_jobs,
  pending_operations,
} from "../runtime/jobs.js"

async function prepare(source, host = {}, options = {}) {
  let output = ""
  const runtime = create_runtime({
    ...options,
    host: {
      ...create_node_host(),
      ...host,
      read_text: (path, encoding) =>
        path === "/io-test.js" ? source : readFile(path, encoding),
      write_stdout: (text) => {
        output += text
      },
    },
  })
  await bootstrap(runtime)
  const module = await load_module(runtime, "file:///io-test.js")
  const roots = heap_stats(runtime.memory).roots
  return {
    runtime,
    get output() {
      return output
    },
    async run() {
      await evaluate_module(runtime, module)
      assert.equal(pending_operations(runtime), 0)
      assert.equal(heap_stats(runtime.memory).roots, roots)
    },
  }
}

test("byte reads report short counts, preserve surrounding bytes, and distinguish EOF", async () => {
  let reads = 0,
    closed = false
  const app = await prepare(
    `
    import { io_open, io_read, io_close, byte_buffer } from "djs:intrinsics";
    const handle = await new Promise((resolve, reject) => io_open("data", "r", 438, resolve, reject));
    const bytes = byte_buffer(5);
    bytes[0] = 17;
    bytes[4] = 19;
    const count = await new Promise((resolve, reject) => io_read(handle, bytes, 1, 3, resolve, reject));
    console.log(handle, count, bytes.length, bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    console.log(await new Promise((resolve, reject) => io_read(handle, bytes, 0, 5, resolve, reject)));
    console.log((await Promise.resolve(bytes)) === bytes);
    await new Promise((resolve, reject) => io_close(handle, resolve, reject));
  `,
    {
      open(path, flags, mode) {
        assert.deepEqual([path, flags, mode], ["data", "r", 0o666])
        return 7
      },
      read(handle, length) {
        assert.equal(handle, 7)
        assert.equal(length, reads === 0 ? 3 : 5)
        return reads++ === 0 ? Uint8Array.of(0, 255) : new Uint8Array()
      },
      close(handle) {
        assert.equal(handle, 7)
        closed = true
      },
    },
  )
  await app.run()
  assert.equal(app.output, "7 2 5 17 0 255 0 19\n0\ntrue\n")
  assert.equal(closed, true)
})

test("I/O validates callbacks and byte ranges before submitting host work", async () => {
  const app = await prepare(
    `
    import { io_open, io_read, io_close, byte_buffer, string_from_code_unit } from "djs:intrinsics";
    const bytes = byte_buffer(2);
    try { io_read(1, bytes, 1, 2, () => {}, () => {}); } catch (e) { console.log(e.name); }
    try { io_read(1, bytes, -1, 1, () => {}, () => {}); } catch (e) { console.log(e.name); }
    try { io_read(1, {}, 0, 1, () => {}, () => {}); } catch (e) { console.log(e.name); }
    try { io_read(1, bytes, 0, 1, 2, () => {}); } catch (e) { console.log(e.name); }
    try { io_open("unused", "r", 438, () => {}); } catch (e) { console.log(e.name); }
    try { io_close(1); } catch (e) { console.log(e.name); }
    try { bytes[2] = 1; } catch (e) { console.log(e.name); }
    try { bytes.length = 10; } catch (e) { console.log(e.name); }
    try { byte_buffer(1.5); } catch (e) { console.log(e.name); }
    try { string_from_code_unit(65536); } catch (e) { console.log(e.name); }
  `,
    {
      open() {
        assert.fail("invalid open must not reach host")
      },
      read() {
        assert.fail("invalid read must not reach host")
      },
      close() {
        assert.fail("invalid close must not reach host")
      },
    },
  )
  await app.run()
  assert.equal(
    app.output,
    "RangeError\nRangeError\nTypeError\nTypeError\nTypeError\nTypeError\nRangeError\nTypeError\nRangeError\nRangeError\n",
  )
})

test(
  "a pending read retains its buffer after the guest drops its reference",
  { timeout: 5000 },
  async () => {
    let finish, started
    const began = new Promise((resolve) => {
      started = resolve
    })
    const app = await prepare(
      `
    import { io_read, byte_buffer } from "djs:intrinsics";
    let bytes = byte_buffer(3);
    io_read(1, bytes, 0, 3, count => console.log(count), error => { throw error; });
    bytes = undefined;
  `,
      {
        read() {
          started()
          return new Promise((resolve) => {
            finish = resolve
          })
        },
      },
      { semispace_bytes: 16384, root_capacity: 1 },
    )
    const evaluation = app.run()
    await began
    collect(app.runtime.memory)
    collect(app.runtime.memory)
    assert.equal(app.output, "")
    finish(Uint8Array.of(1, 2, 3))
    await evaluation
    assert.equal(app.output, "3\n")
  },
)

test("completion slots are reused and concurrent results retain callbacks across moving GC", async () => {
  let output = ""
  const runtime = create_runtime({
    semispace_bytes: 16384,
    root_capacity: 1,
    host: {
      write_stdout: (text) => {
        output += text
      },
    },
  })
  const callback = alloc_root(runtime.memory)
  create_function(
    runtime.memory,
    callback,
    NATIVE_CODE,
    intrinsic_id("write_stdout"),
  )
  const baseline = heap_stats(runtime.memory).roots
  let capacity
  for (let pass = 0; pass < 3; pass++) {
    const finish = []
    for (let index = 0; index < 40; index++) {
      start_operation(
        runtime,
        callback,
        callback,
        () =>
          new Promise((resolve) => {
            finish.push(resolve)
          }),
      )
    }
    await new Promise(setImmediate)
    assert.equal(pending_operations(runtime), 40)
    collect(runtime.memory)
    for (let index = 39; index >= 0; index--) finish[index](String(index) + ",")
    await new Promise(setImmediate)
    assert.equal(
      output,
      Array.from({ length: pass * 40 }, (_, i) => 39 - (i % 40))
        .map((n) => n + ",")
        .join(""),
    )
    collect(runtime.memory)
    drain_completions(runtime)
    drain_jobs(runtime)
    assert.equal(pending_operations(runtime), 0)
    assert.equal(heap_stats(runtime.memory).roots, baseline)
    if (capacity === undefined) capacity = runtime.scheduler.operations.length
    assert.equal(runtime.scheduler.operations.length, capacity)
  }
  assert.equal(
    output,
    Array.from({ length: 120 }, (_, i) => 39 - (i % 40))
      .map((n) => n + ",")
      .join(""),
  )
  free_root(runtime.memory, callback)
  collect(runtime.memory)
  assert.equal(heap_stats(runtime.memory).used_bytes, 0)
})

test("the Node host advances file positions and rejects closed or unknown handles", async () => {
  const host = create_node_host()
  const path = fileURLToPath(new URL("../test-file.txt", import.meta.url))
  const expected = await readFile(path)
  const handle = await host.open(path, "r", 0o666)
  try {
    assert.deepEqual(
      await host.read(handle, 2),
      new Uint8Array(expected.subarray(0, 2)),
    )
    assert.deepEqual(
      await host.read(handle, expected.length),
      new Uint8Array(expected.subarray(2)),
    )
    assert.equal((await host.read(handle, 1)).length, 0)
  } finally {
    await host.close(handle)
  }
  await assert.rejects(host.read(handle, 1), { code: "EBADF" })
  await assert.rejects(host.close(handle), { code: "EBADF" })
  await assert.rejects(host.read(9999, 1), { code: "EBADF" })
})

test("readFile handles multiple chunks and UTF-8 sequences split at the read boundary", async () => {
  const bytes = Buffer.concat([
    Buffer.alloc(4095, 97),
    Buffer.from("€😀\0z"),
    Buffer.alloc(100, 98),
    Buffer.from([0xe2, 0x82]),
  ])
  let position = 0,
    reads = 0,
    closed = false
  const app = await prepare(
    `
    import { readFile } from "node:fs/promises";
    import { write_stdout } from "djs:intrinsics";
    write_stdout(await readFile("data", "utf8"));
  `,
    {
      open: () => 1,
      read(handle, length) {
        assert.equal(handle, 1)
        reads++
        const chunk = bytes.subarray(position, position + length)
        position += chunk.length
        return chunk
      },
      close: () => {
        closed = true
      },
    },
    { max_steps: 5000000, semispace_bytes: 131072 },
  )
  await app.run()
  assert.equal(app.output, bytes.toString("utf8"))
  assert.equal(reads, 3)
  assert.equal(closed, true)
  assert.ok(heap_stats(app.runtime.memory).collections > 0)
})

test("userland UTF-8 decoding matches replacement semantics across one-byte short reads", async () => {
  const bytes = Buffer.from([
    0xef, 0xbb, 0xbf, 0, 0x7f, 0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98,
    0x80, 0xc0, 0xaf, 0x80, 0xff, 0xe0, 0x80, 0x80, 0xed, 0xa0, 0x80, 0xf4,
    0x90, 0x80, 0x80, 0xe2, 0x82, 0x41, 0xf0, 0x9f,
  ])
  let position = 0
  const app = await prepare(
    `
    import { readFile } from "node:fs/promises";
    import { write_stdout } from "djs:intrinsics";
    write_stdout(await readFile("data", "utf-8"));
  `,
    {
      open: () => 1,
      read: () => bytes.subarray(position, ++position),
      close: () => {},
    },
  )
  await app.run()
  assert.equal(app.output, bytes.toString("utf8"))
})

test("empty files resolve to an empty string and still close the handle", async () => {
  let closed = false
  const app = await prepare(
    `
    import { readFile } from "node:fs/promises";
    console.log((await readFile("empty", "utf8")) === "");
  `,
    {
      open: () => 1,
      read: () => new Uint8Array(),
      close: () => {
        closed = true
      },
    },
  )
  await app.run()
  assert.equal(app.output, "true\n")
  assert.equal(closed, true)
})

for (const stage of [
  "open",
  "read",
  "close",
  "invalid read",
  "read and close",
]) {
  test(`readFile propagates ${stage} failures and releases operation roots`, async () => {
    let closed = 0
    const error = Object.assign(new Error("failed"), { code: "EIO" })
    const app = await prepare(
      `
      import { readFile } from "node:fs/promises";
      try { await readFile("data", "utf8"); }
      catch (error) { console.log(error instanceof Error, error.code, error.syscall, error.path); }
    `,
      {
        open() {
          if (stage === "open") throw error
          return 1
        },
        read() {
          if (stage === "read" || stage === "read and close")
            return Promise.reject(error)
          if (stage === "invalid read") return "not bytes"
          return new Uint8Array()
        },
        close() {
          closed++
          if (stage === "close" || stage === "read and close") throw error
        },
      },
    )
    await app.run()
    const syscall = stage === "open" || stage === "close" ? stage : "read"
    assert.equal(
      app.output,
      `true ${stage === "invalid read" ? "undefined" : "EIO"} ${syscall} ${stage === "open" ? "data" : "undefined"}\n`,
    )
    assert.equal(closed, stage === "open" ? 0 : 1)
  })
}

test("invalid encodings reject before opening a file", async () => {
  const app = await prepare(
    `
    import { readFile } from "node:fs/promises";
    try { await readFile("data", "latin1"); } catch (e) { console.log(e.name, e.message); }
  `,
    {
      open() {
        assert.fail("invalid encoding must not open a file")
      },
    },
  )
  await app.run()
  assert.equal(app.output, "TypeError Only utf8 encoding is supported\n")
})
