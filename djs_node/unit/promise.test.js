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

test("Promise is a constructor with synchronous executors and asynchronous reactions", async () => {
  const { output } = await execute(`
    console.log(typeof Promise, Promise.name, Promise.length);
    const promise = new Promise((resolve, reject) => {
      console.log("executor"); resolve(7); reject(8); throw 9;
    });
    console.log(promise instanceof Promise, promise.constructor === Promise);
    promise.then(value => console.log("fulfilled", value));
    console.log("sync");
  `)
  assert.equal(
    output,
    "function Promise 1\nexecutor\ntrue true\nsync\nfulfilled 7\n",
  )
})

test("invalid constructors, executors and receivers throw catchable errors", async () => {
  const { output } = await execute(`
    try { Promise(function() {}); } catch (e) { console.log(e.name, e instanceof TypeError); }
    try { new Promise(1); } catch (e) { console.log(e.name); }
    try { new Promise.resolve(1); } catch (e) { console.log(e.name); }
    const then = Promise.prototype.then;
    try { then(); } catch (e) { console.log(e.name); }
    new Promise(() => { throw { reason: 42 }; }).catch(e => console.log(e.reason));
    new Promise(class Executor {}).catch(e => console.log(e.name));
  `)
  assert.equal(
    output,
    "TypeError true\nTypeError\nTypeError\nTypeError\n42\nTypeError\n",
  )
})

test("chaining propagates values, thrown values, omitted handlers and cycles", async () => {
  const { output } = await execute(`
    const reason = { message: "reason" };
    const p = Promise.resolve(2);
    console.log(Promise.resolve(p) === p);
    p.then(value => value + 3).then().then(value => console.log(value));
    Promise.reject(reason).then().catch(error => console.log(error === reason));
    p.then(() => { throw reason; }).catch(error => console.log(error === reason));
    const self = Promise.withResolvers();
    self.resolve(self.promise);
    self.promise.catch(error => console.log("self", error instanceof TypeError));
    let cycle;
    cycle = p.then(() => cycle);
    cycle.catch(error => console.log("cycle", error.name));
  `)
  assert.equal(output, "true\nself true\ntrue\ntrue\ncycle TypeError\n5\n")
})

test("thenable lookup is synchronous and invocation is queued with its receiver", async () => {
  const { output } = await execute(`
    let reads = 0;
    const then = function(resolve, reject) {
      console.log("then", this.value); resolve(12); reject(13); throw 14;
    };
    then.call = () => { throw "patched call"; };
    const thenable = { value: 11, get then() { reads = reads + 1; console.log("get"); return then; } };
    const p = Promise.resolve(thenable);
    console.log("sync", reads);
    p.then(value => console.log("result", value, reads));
    Promise.resolve({ get then() { throw "getter"; } }).catch(error => console.log(error));
  `)
  assert.equal(output, "get\nsync 1\nthen 11\ngetter\nresult 12 1\n")
})

test("adopting a pending promise locks out later resolve, reject and executor errors", async () => {
  const { output } = await execute(`
    const pending = Promise.withResolvers();
    const p = new Promise((resolve, reject) => {
      resolve(pending.promise); reject("late rejection"); resolve("late value"); throw "late throw";
    });
    p.then(value => console.log(value), error => console.log("wrong", error));
    pending.resolve("adopted");
  `)
  assert.equal(output, "adopted\n")
})

test("await uses internal operations and rejected await unwinds through finally", async () => {
  const { output } = await execute(`
    const p = Promise.resolve(17);
    Promise.resolve = () => { throw "patched resolve"; };
    Promise.prototype.then = () => { throw "patched then"; };
    console.log(await p);
    console.log(await { then(resolve) { resolve(18); } });
    const reason = { value: 19 };
    try {
      try { await Promise.reject(reason); }
      finally { console.log("finally"); }
    } catch (error) { console.log(error === reason); }
  `)
  assert.equal(output, "17\n18\nfinally\ntrue\n")
})

test("finally preserves outcomes and adopts cleanup results", async () => {
  const { output } = await execute(`
    console.log(await Promise.resolve(3).finally(() => Promise.resolve(4)));
    try { await Promise.reject("original").finally(() => 5); } catch (e) { console.log(e); }
    try { await Promise.resolve(3).finally(() => { throw "cleanup"; }); } catch (e) { console.log(e); }
    console.log(await Promise.resolve(6).finally(null));
  `)
  assert.equal(output, "3\noriginal\ncleanup\n6\n")
})

test("jobs preserve FIFO order through queue growth, nested jobs and interpreter slices", async () => {
  const { output } = await execute(`
    let count = 0;
    const p = Promise.resolve(1);
    let index = 0;
    while (index < 80) {
      p.then(() => { count = count + 1; });
      index = index + 1;
    }
    p.then(() => {
      console.log("first", count);
      p.then(() => console.log("nested"));
    });
    p.then(() => console.log("second"));
    while (index < 4000) { index = index + 1; }
    console.log("sync", count);
  `)
  assert.equal(output, "sync 0\nfirst 80\nsecond\nnested\n")
})

test("base classes initialize fields, share methods, preserve arrow this and enforce brands", async () => {
  const { output } = await execute(`
    function make() {
      return class Box {
        #value = 2;
        #read() { return this.#value; }
        read = () => this.#read();
        static value = this;
        static has(value) { return #value in value; }
        method() { return this.#read; }
        get value() { return this.#value; }
        set value(next) { this.#value = next; }
      };
    }
    const Box = make();
    const Other = make();
    const first = new Box();
    const second = new Box();
    first["#value"] = 100;
    first.value = 9;
    const read = first.read;
    console.log(read(), second.value, first.method() === second.method());
    console.log(Box.value === Box, Box.has(first), Other.has(first));
    try { const detached = first.method; detached(); } catch (e) { console.log(e.name); }
    function ordinary() { return 23; }
    console.log(ordinary());
  `)
  assert.equal(output, "9 2 true\ntrue true false\nTypeError\n23\n")
})

test("finally preserves and overrides return and throw completions across frames", async () => {
  const { output } = await execute(`
    function one() { try { return 1; } finally { console.log("one"); } }
    function two() { try { return 2; } finally { return 3; } }
    function three() { try { throw 4; } finally { return 5; } }
    function four() { try { return 6; } finally { throw 7; } }
    console.log(one(), two(), three());
    try { four(); } catch (e) { console.log(e); }
    try { missing(); } catch (e) { console.log(e.name, e instanceof Error); }
    console.log(false && missing(), true || missing(), true || false && missing());
  `)
  assert.equal(output, "one\n1 3 5\n7\nReferenceError true\nfalse true true\n")
})

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

test("computed class keys inherit this and private methods remain readonly", async () => {
  const { output } = await execute(`
    const factory = {
      key: "value",
      make() { return class { [this.key] = 31; }; }
    };
    const Constructor = factory.make();
    console.log(new Constructor().value);
    class Private {
      #read() { return 1; }
      replace() { this.#read = () => 2; }
    }
    try { new Private().replace(); } catch (error) { console.log(error.name); }
    const object = { value: 1, get value() { return 2; } };
    console.log(object.value);
  `)
  assert.equal(output, "31\nTypeError\n2\n")
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
