import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.ts"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.ts"
import { collect, heap_stats } from "../vm/heap.ts"

async function execute(source, options = {}) {
  let output = ""
  const runtime = create_runtime({
    ...options,
    host: {
      read_text: (path, encoding) =>
        path === "/builtins-test.js" ? source : readFile(path, encoding),
      write_stdout: (text) => {
        output += text
      },
    },
  })
  await bootstrap(runtime)
  const module = await load_module(runtime, "file:///builtins-test.js")
  const roots = heap_stats(runtime.memory).roots
  const collections_before = heap_stats(runtime.memory).collections
  await evaluate_module(runtime, module)
  assert.equal(
    heap_stats(runtime.memory).roots,
    roots,
    "execution releases temporary roots",
  )
  return { output, runtime, collections_before }
}

test("array and string operations release temporary roots on success and exceptions", async () => {
  await execute(`
    import { define_property as define, call } from "djs:intrinsics";
    const values = [3,,1,2];
    values.map(value => value + 1).filter(value => value > 2).join("-");
    values.sort((a,b) => a-b).flatMap(value => [value,value]);
    Array.from("A😀B");
    new String("a😀b").slice(1).toWellFormed();
    "abcabc".replaceAll("bc", (match,index) => match+index);
    const reason = {};
    try { values.map(() => {throw reason}) } catch (error) {}
    try { values.sort(() => {throw reason}) } catch (error) {}
    try { "abc".replaceAll("b", () => {throw reason}) } catch (error) {}
    try { String({toString(){throw reason}}) } catch (error) {}
    try { call(String.prototype.valueOf,{}) } catch (error) {}
    define(values,"1",{get(){throw reason},configurable:false});
    try { values.join() } catch (error) {}
    try { define(values,"length",{value:0,writable:false}) } catch (error) {}
  `)
})

test("arrays, wrappers, accessors and captured new.target survive moving collection", async () => {
  const { output, runtime } = await execute(
    `
    import { define_property as define } from "djs:intrinsics";
    const retained = [new String("a😀b"), [1,,3]];
    function Capture() { return ()=>new.target }
    const target = new Capture();
    define(retained[1],"1",{get(){return retained[0].codePointAt(1)},configurable:true});
    let index = 0;
    let result;
    while (index < 180) {
      result = retained[1].map(value=>value+1).join("-");
      index=index+1;
    }
    console.log(result,retained[0][0],target()===Capture);
  `,
    { semispace_bytes: 65536, root_capacity: 1, max_steps: 5000000 },
  )
  assert.equal(output, "2-128513-4 a true\n")
  assert.ok(heap_stats(runtime.memory).collections > 10)
  collect(runtime.memory)
})

test("rest arrays and method metadata survive moving collection without leaking roots", async () => {
  const { output, runtime, collections_before } = await execute(
    `
    function retain(first, ...items) {return () => items}
    const saved = retain(null, {value:"retained"}, 2);
    let index = 0;
    let object;
    while (index < 1000) {
      object = {["method" + index](value, optional = undefined) {return value}};
      object.method = object["method" + index];
      retain(null, object, saved());
      index = index + 1;
    }
    console.log(saved()[0].value, saved().length, object.method.name, object.method.length);
    saved()[3] = 4;
    console.log(saved().length, saved()[3]);
  `,
    { semispace_bytes: 65536, root_capacity: 1, max_steps: 5000000 },
  )
  assert.equal(output, "retained 2 method999 1\n4 4\n")
  assert.ok(heap_stats(runtime.memory).collections > collections_before + 10)
  collect(runtime.memory)
})
