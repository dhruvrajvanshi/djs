import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.js"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.js"
import { collect, heap_stats } from "../vm/heap.js"
import { compile_module } from "../compiler/compile.js"

async function execute(source, options = {}) {
  let output = ""
  const runtime = create_runtime({
    ...options,
    host: {
      read_text: (path, encoding) =>
        path === "/promise-test.js" ? source : readFile(path, encoding),
      write_stdout: (text) => {
        output += text
      },
    },
  })
  await bootstrap(runtime)
  const module = await load_module(runtime, "file:///promise-test.js")
  const roots = heap_stats(runtime.memory).roots
  await evaluate_module(runtime, module)
  assert.equal(
    heap_stats(runtime.memory).roots,
    roots,
    "execution must release temporary roots",
  )
  return { output, runtime, module }
}

test("private names and unsupported class forms fail before execution", () => {
  for (const source of [
    "class C { #value; #value; }",
    "class C { read() { return this.#missing; } }",
    "class C { constructor() {} constructor() {} }",
    "class C extends D {}",
    "const x = #missing in {};",
  ])
    assert.throws(() => compile_module(source), SyntaxError)
})

test("promise chains and private values survive repeated moving collections", async () => {
  const { output, runtime } = await execute(
    `
    let p = Promise.resolve("start");
    let index = 0;
    while (index < 120) {
      p = p.then(value => value + "!");
      if (index % 10 === 0) p = Promise.resolve(await p);
      index = index + 1;
    }
    console.log((await p).length);
  `,
    { semispace_bytes: 65536, root_capacity: 2 },
  )
  assert.equal(output, "125\n")
  assert.ok(heap_stats(runtime.memory).collections > 2)
  collect(runtime.memory)
  assert.ok(heap_stats(runtime.memory).used_bytes < 65536)
})

test("imported call and enqueue_job intrinsics use guest frames and preserve job order", async () => {
  let output = ""
  const source = `
    import { call, enqueue_job as enqueue, write_stdout as write } from "djs:intrinsics";
    function log(value) { write("" + value + "\\n"); }
    const fn = function(a, b) { return this.value + a + b; };
    fn.call = () => { throw "patched"; };
    log(call(fn, { value: 1 }, 2, 3));
    const reason = {};
    try { call(() => { throw reason; }, undefined); }
    catch (error) { log(error === reason); }
    try { enqueue(1); } catch (error) { log(error.name); }
    enqueue(() => { log("first"); enqueue(() => log("nested")); });
    enqueue(() => log("second"));
    log("sync");
    export default undefined;
  `
  const runtime = create_runtime({
    host: {
      read_text: () => source,
      write_stdout: (text) => {
        output += text
      },
    },
  })
  const module = await load_module(runtime, "node:console")
  const roots = heap_stats(runtime.memory).roots
  await evaluate_module(runtime, module)
  assert.equal(output, "6\ntrue\nTypeError\nsync\nfirst\nsecond\nnested\n")
  assert.equal(heap_stats(runtime.memory).roots, roots)
})

test("uncaught guest errors retain their name and message", async () => {
  await assert.rejects(
    execute(
      `await Promise.resolve().then(() => { throw new TypeError("handler"); });`,
    ),
    /TypeError: handler/,
  )
})

test(
  "the instruction budget includes chains of microtasks",
  { timeout: 5000 },
  async () => {
    await assert.rejects(
      execute(
        `
    const p = Promise.resolve();
    function again() { p.then(again); }
    again();
  `,
        { max_steps: 10000 },
      ),
      /VM instruction limit exceeded/,
    )
  },
)
