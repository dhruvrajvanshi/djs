import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.ts"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.ts"
import { heap_stats } from "../vm/heap.ts"
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
