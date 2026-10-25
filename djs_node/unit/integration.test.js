import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { bootstrap } from "../runtime/bootstrap.js"
import { create_node_host } from "../host/node.js"
import {
  create_runtime,
  module_status,
  MODULE_STATE,
  run_module,
} from "../runtime/modules.js"

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

test("stdlib console formats variadic calls and writes each line once", async (t) => {
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

test("stdlib console formats error fields recursively and keeps ordinary objects generic", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      console.log(Error.prototype, TypeError.prototype);
      console.log(new Error(new TypeError("nested")));
      const error = new Error(null);
      error.name = 42;
      const object = {
        name: "Error", message: "ordinary",
        toString() { throw "unexpected coercion"; }
      };
      console.log(error, object);
      console.log(-Infinity, 1.25, 1e21, 1e-7);
    `,
  })
  await app.run()
  assert.equal(
    app.output,
    "undefined: undefined undefined: undefined\n" +
      "Error: TypeError: nested\n42: null [object Object]\n" +
      "-Infinity 1.25 1e+21 1e-7\n",
  )
})

test("guest arguments are unmapped, mutable and local to each invocation", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      function inspect(first, missing) {
        first = "parameter";
        console.log(arguments.length, arguments[0], arguments[1], arguments[2], missing);
        arguments[0] = "argument";
        console.log(first, arguments[0]);
        return arguments;
      }
      const saved = inspect("original");
      const empty = inspect();
      console.log(saved.length, saved[0], saved === empty);
      function replace(value) {
        arguments = { length: 1, "0": value };
        return arguments[0];
      }
      console.log(replace("replacement"));
    `,
  })
  await app.run()
  assert.equal(
    app.output,
    "1 original undefined undefined undefined\nparameter argument\n" +
      "0 undefined undefined undefined undefined\nparameter argument\n" +
      "1 argument false\nreplacement\n",
  )
})

test("arrows capture arguments while ordinary functions own them and bindings shadow them", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      function capture(value) {
        return {
          read: () => () => arguments,
          own: function() { return arguments; }
        };
      }
      const first = capture("outer", 17);
      const second = capture("other");
      console.log(first.read()().length, first.read()()[0], first.read()()[1]);
      console.log(second.read()()[0], first.own("inner")[0], first.own().length);
      function parameter(arguments) { return () => arguments; }
      function local() { const arguments = "local"; return () => arguments; }
      function shadow() {
        { const arguments = "block"; console.log(arguments); }
        return arguments[0];
      }
      console.log(parameter("parameter")(), local()(), shadow("function"));
      console.log(typeof arguments, (() => typeof arguments)());
      const object = { method() { return arguments[0]; } };
      class Box { constructor() { this.value = arguments[0]; } }
      console.log(object.method("method"), new Box("constructor").value);
    `,
  })
  await app.run()
  assert.equal(
    app.output,
    "2 outer 17\nother inner 0\nblock\nparameter local function\n" +
      "undefined undefined\nmethod constructor\n",
  )
})

test("local imports evaluate dependencies once and preserve named live bindings", async (t) => {
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

test("hoisted functions create closures sharing mutation within each invocation", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      const first = make(5);
      const second = make(20);
      function make(initial) {
        let value = initial;
        return {
          increment: function() { value = value + 1; return value; },
          read: function() { return value; }
        };
      }
      console.log(first.read(), first.increment(), first.read(), second.read());
    `,
  })
  await app.run()
  assert.equal(app.output, "5 6 6 20\n")
})

test("property calls preserve this while detached calls receive undefined", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      const object = {
        value: 7,
        increment: function(amount) { this.value = this.value + amount; return this.value; },
        receiver: function() { return this; }
      };
      const detached = object.receiver;
      console.log(object.increment(3), object.value, detached() === undefined);
      console.log((object.receiver)() === object);
    `,
  })
  await app.run()
  assert.equal(app.output, "10 10 true\ntrue\n")
})

test("numeric computed properties use the same key as their string spelling", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      const object = {};
      object[1] = "first";
      console.log(object[1], object["1"]);
      object["1"] = "changed";
      console.log(object[1]);
    `,
  })
  await app.run()
  assert.equal(app.output, "first first\nchanged\n")
})

test("typeof tolerates unresolved identifiers and void evaluates object-producing effects", async (t) => {
  const app = await fixture(t, {
    "entry.js": `
      let effects = 0;
      function effect() { effects = effects + 1; return {}; }
      console.log(typeof missing, typeof (alsoMissing));
      console.log(void {}, void effect(), effects);
    `,
  })
  await app.run()
  assert.equal(app.output, "undefined undefined\nundefined undefined 1\n")
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
  test(`${name} fails module evaluation before later statements execute`, async (t) => {
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

test("imported bindings are readonly aliases", async (t) => {
  const app = await fixture(t, {
    "dependency.js": "export let value = 1;",
    "entry.js": "import { value } from './dependency.js'; value = 2;",
  })
  await assert.rejects(app.run(), /imported binding/)
})

test("guest modules share intrinsic function values through ordinary imports", async (t) => {
  const app = await fixture(t, {
    "dependency.js": `
      import { write_stdout } from "djs:intrinsics";
      export const saved = write_stdout;
    `,
    "entry.js": `
      import "djs:intrinsics";
      import { write_stdout as write, io_read, enqueue_job, call } from "djs:intrinsics";
      import { saved } from "./dependency.js";
      console.log(typeof write, typeof io_read, typeof enqueue_job, typeof call, write === saved);
      const emit = write;
      emit("direct\\n");
      const holder = { write };
      holder.write("member\\n");
      call(write, undefined, "called\\n");
      enqueue_job(() => write("queued\\n"));
      console.log(emit("return\\n") === undefined);
      try { write = () => {}; } catch (error) { console.log(error.name); }
    `,
  })
  await app.run()
  assert.equal(
    app.output,
    "function function function function true\ndirect\nmember\ncalled\nreturn\ntrue\nTypeError\nqueued\n",
  )
})

test("top-level await receives asynchronous file text with explicit utf8 encoding", async (t) => {
  const app = await fixture(t, {
    "contents.txt": "file contents",
    "entry.js": "",
  })
  await writeFile(
    join(app.directory, "entry.js"),
    `
    import fs from "node:fs/promises";
    import { readFile } from "node:fs/promises";
    const path = ${JSON.stringify(join(app.directory, "contents.txt"))};
    console.log(await fs.readFile(path, "utf8"));
    console.log(await readFile(path, "utf-8"));
  `,
  )
  await app.run()
  assert.equal(app.output, "file contents\nfile contents\n")
})

test("failed host file reads reject top-level module evaluation", async (t) => {
  const app = await fixture(t, { "entry.js": "" })
  await writeFile(
    join(app.directory, "entry.js"),
    `
    import fs from "node:fs/promises";
    console.log(await fs.readFile(${JSON.stringify(join(app.directory, "missing.txt"))}, "utf8"));
  `,
  )
  await assert.rejects(app.run(), /ENOENT/)
  assert.equal(app.output, "")
})

test("top-level rejection propagates the guest rejection value", async (t) => {
  const app = await fixture(t, {
    "entry.js":
      'await Promise.reject("guest failure"); console.log("unreachable");',
  })
  await assert.rejects(app.run(), /guest failure/)
  assert.equal(app.output, "")
})

test("readFile without an explicit encoding produces an encoding diagnostic", async (t) => {
  const app = await fixture(t, {
    "entry.js":
      'import fs from "node:fs/promises"; await fs.readFile("unused");',
  })
  await assert.rejects(app.run(), /explicit utf8 encoding/)
})

test("CLI reports source errors and top-level rejection with nonzero status", async (t) => {
  const app = await fixture(t, { "entry.js": "const value = ;" })
  const cli = fileURLToPath(new URL("../djs_node.js", import.meta.url))
  const source_error = spawnSync(
    process.execPath,
    [cli, join(app.directory, "entry.js")],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  )
  assert.equal(source_error.status, 1)
  assert.equal(source_error.stdout, "")
  assert.match(source_error.stderr, /Expected an expression/)

  await writeFile(
    join(app.directory, "entry.js"),
    'await Promise.reject("cli rejection");',
  )
  const rejection = spawnSync(
    process.execPath,
    [cli, join(app.directory, "entry.js")],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  )
  assert.equal(rejection.status, 1)
  assert.equal(rejection.stdout, "")
  assert.match(rejection.stderr, /cli rejection/)
})

for (const [name, source, diagnostic] of [
  [
    "unknown builtin module",
    'import value from "node:unknown";',
    /Unsupported builtin module: node:unknown/,
  ],
  [
    "removed intrinsic syntax",
    'const fn = @djs_intrinsic("write_stdout");',
    /Expected Class/,
  ],
  [
    "unknown intrinsic export",
    'import { unknown } from "djs:intrinsics";',
    /djs:intrinsics does not export unknown/,
  ],
  [
    "missing intrinsic default export",
    'import intrinsics from "djs:intrinsics";',
    /djs:intrinsics does not export default/,
  ],
  [
    "unknown djs module",
    'import "djs:unknown";',
    /Unsupported builtin module: djs:unknown/,
  ],
  ["parser errors", "const value = ;", /Expected an expression/],
  [
    "missing named export",
    'import { missing } from "./dependency.js";',
    /does not export missing/,
  ],
]) {
  test(`${name} is rejected before guest execution`, async (t) => {
    const app = await fixture(t, {
      "dependency.js": "export const value = 1;",
      "entry.js": `${source}\nconsole.log("unreachable");`,
    })
    await assert.rejects(app.run(), diagnostic)
    assert.equal(app.output, "")
  })
}
