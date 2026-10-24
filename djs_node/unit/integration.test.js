import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { bootstrap } from "../runtime/bootstrap.ts"
import { create_node_host } from "../host/node.ts"
import {
  create_runtime,
  module_status,
  MODULE_STATE,
  run_module,
} from "../runtime/modules.ts"

async function fixture(t, files) {
  const directory = await mkdtemp(join(tmpdir(), "djs-integration-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all(
    Object.entries(files).map(([name, source]) =>
      writeFile(join(directory, name), source),
    ),
  )
  let output = ""
  const writes = []
  const runtime = create_runtime({
    host: {
      ...create_node_host(),
      read_text: readFile,
      write_stdout: (text) => {
        output += text
        writes.push(text)
      },
    },
  })
  await bootstrap(runtime)
  return {
    runtime,
    directory,
    writes,
    get output() {
      return output
    },
    run: () => run_module(runtime, join(directory, "entry.js")),
  }
}

test("stdlib console writes each formatted line in one host call", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      import console, { log } from "node:console";
      log();
      log("hello", "world");
      log(undefined, null, true, false, 0, -0, 42, NaN, Infinity);
      log({}, function() {}, new TypeError("failure"));
      log("%s", "literal", "line\\nbreak", "😀");
      console.log(log === console.log, log("return") === undefined);
    `,
  })
  await app.run()
  assert.deepEqual(app.writes, [
    "\n",
    "hello world\n",
    "undefined null true false 0 0 42 NaN Infinity\n",
    "[object Object] [Function] TypeError: failure\n",
    "%s literal line\nbreak 😀\n",
    "return\n",
    "true true\n",
  ])
})

test("module evaluation caches evaluated dependencies and entry modules", async (t) => {
  const app = await fixture(t, {
    "dependency.js": `
      console.log("dependency");
      export let count = 1;
      export function increment() { count = count + 1; }
      export default { label: "dep" };
    `,
    "side-effect.js": `
      import { increment } from './dependency.js';
      increment();
      console.log("side-effect");
    `,
    "entry.js": `
      import api, { count as current, increment as inc } from './dependency.js';
      import './side-effect.js';
      console.log(api.label, current);
      inc();
      console.log(current);
    `,
  })
  const module = await app.run()
  assert.equal(app.output, "dependency\nside-effect\ndep 2\n3\n")
  assert.equal(module_status(module), MODULE_STATE.EVALUATED)
  await app.run()
  assert.equal(app.output, "dependency\nside-effect\ndep 2\n3\n")
})

for (const [name, source, diagnostic] of [
  [
    "temporal dead zone",
    "console.log(value); let value = 1;",
    /before initialization/,
  ],
  [
    "block temporal dead zone",
    "let value = 1; { console.log(value); let value = 2; }",
    /before initialization/,
  ],
  [
    "typeof temporal dead zone",
    "console.log(typeof value); let value = 1;",
    /before initialization/,
  ],
  ["unresolved global", "console.log(missing);", /missing is not defined/],
  ["constant assignment", "const value = 1; value = 2;", /constant binding/],
]) {
  test(`${name} leaves the entry module in the errored state`, async (t) => {
    const app = await fixture(t, {
      "entry.js": `${source}\nconsole.log("unreachable");`,
    })
    await assert.rejects(app.run(), diagnostic)
    assert.equal(app.output, "")
    assert.equal(
      module_status(app.runtime.modules.at(-1)),
      MODULE_STATE.ERRORED,
    )
  })
}
