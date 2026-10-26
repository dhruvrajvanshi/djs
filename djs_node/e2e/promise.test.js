import assert from "node:assert/strict"
import test from "node:test"
import { execute, fixture } from "./helpers.js"

test("imported call and enqueue_job intrinsics preserve receivers, errors and job order", async (t) => {
  const source = `
    import { call, host_enqueue_promise_job as enqueue } from "djs:native";
    import { write_stdout as write } from "djs:host";
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
  const { output } = await execute(t, source)
  assert.equal(output, "6\ntrue\nTypeError\nsync\nfirst\nsecond\nnested\n")
})

test("uncaught guest errors retain their name and message", async (t) => {
  const app = await fixture(t, {
    "entry.js": `await Promise.resolve().then(() => { throw new TypeError("handler"); });`,
  })
  const result = app.run({ status: 1, stderr: /TypeError: handler/ })
  assert.equal(result.stdout, "")
})

test("finally blocks unwind deep recursion and keep completions across await", async (t) => {
  const { output } = await execute(
    t,
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
      finally { await Promise.resolve(); }
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
  )
  assert.equal(output, "true 25\ntrue\n99\n")
})
