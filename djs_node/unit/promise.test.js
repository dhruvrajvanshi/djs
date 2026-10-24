import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.ts"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.ts"
import { collect, heap_stats } from "../vm/heap.ts"
import { compile_module } from "../compiler/compile.ts"

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

test("call and enqueue_job release temporary guest frame roots", async () => {
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
      write_stdout: () => {},
    },
  })
  const module = await load_module(runtime, "node:console")
  const roots = heap_stats(runtime.memory).roots
  await evaluate_module(runtime, module)
  assert.equal(heap_stats(runtime.memory).roots, roots)
})

test("grown frame and handler stacks unwind and preserve completions across await", async () => {
  const { output, runtime } = await execute(
    `
    const token = { value: 42 };
    let cleaned = 0;
    function unwind(depth) {
      try {
        if (depth === 0) throw token;
        return unwind(depth - 1);
      } finally {
        cleaned = cleaned + 1;
      }
    }
    try { unwind(24); }
    catch (error) { console.log(error === token, cleaned); }

    async function preserve() {
      try { return token; }
      finally {
        await Promise.resolve();
        let index = 0;
        let garbage;
        while (index < 300) {
          garbage = { value: index };
          index = index + 1;
        }
      }
    }
    console.log((await preserve()) === token);

    async function replace() {
      try { throw token; }
      finally {
        await Promise.resolve();
        return 99;
      }
    }
    console.log(await replace());
    `,
    { semispace_bytes: 65536, root_capacity: 2 },
  )
  assert.equal(output, "true 25\ntrue\n99\n")
  assert.ok(
    runtime.contexts.some(
      (context) =>
        context.frames.length > 1024 && context.handlers.length > 256,
    ),
    "recursion must exercise frame and handler storage growth",
  )
  assert.ok(heap_stats(runtime.memory).collections > 0)
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
