import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.ts"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.ts"
import { compile_module } from "../compiler/compile.ts"
import { disassemble_module } from "../compiler/disassemble.ts"
import { collect, heap_stats } from "../vm/heap.ts"

async function execute(source, options = {}) {
  let output = ""
  const runtime = create_runtime({
    ...options,
    host: {
      read_text: (path, encoding) =>
        path === "/builtin-hooks.js" ? source : readFile(path, encoding),
      write_stdout: (value) => {
        output += value
      },
    },
  })
  await bootstrap(runtime)
  const module = await load_module(runtime, "file:///builtin-hooks.js")
  const roots = heap_stats(runtime.memory).roots
  const collections_before = heap_stats(runtime.memory).collections
  await evaluate_module(runtime, module)
  assert.equal(
    heap_stats(runtime.memory).roots,
    roots,
    "hooks release temporary roots",
  )
  return { output, runtime, collections_before }
}

test("intrinsic annotations lower to builtin metadata and hidden dispatch", () => {
  const unit = compile_module(`
    @builtin({name:"Record",length:1})
    class Record {
      @internalMethod("Call") static #call(receiver,args) { return args.length }
      @internalMethod("DefineOwnProperty") #define(key,descriptor) { return false }
    }
  `)
  const text = disassemble_module(unit)
  assert.match(text, /INIT_BUILTIN_CLASS/)
  assert.match(text, /INSTALL_INTERNAL_METHOD.*hook=0/)
  assert.match(text, /INSTALL_INTERNAL_METHOD.*hook=2/)
  assert.match(text, /REGISTER_BUILTIN/)
  assert.equal(
    unit.imports.length,
    0,
    "annotations are not runtime function calls",
  )
})

test("unsupported and malformed intrinsic annotations are rejected before execution", () => {
  const sources = [
    "@unknown() class A {}",
    "@builtin(dynamic) class A {}",
    '@builtin({name:"A",name:"B"}) class A {}',
    '@builtin({prototype:"unknown"}) class A {}',
    "@builtin({length:-1}) class A {}",
    "@builtin({}) @builtin({}) class A {}",
    'class A { @internalMethod("Call") static #call(a,b) {} }',
    '@builtin({}) class A { @internalMethod("Get") #get(a,b) {} }',
    '@builtin({}) class A { @internalMethod("Call") #call(a,b) {} }',
    '@builtin({}) class A { @internalMethod("Construct") static make(a,b) {} }',
    '@builtin({}) class A { @internalMethod("DefineOwnProperty") static #define(a,b) {} }',
    '@builtin({}) class A { @internalMethod("Call") static async #call(a,b) {} }',
    '@builtin({}) class A { @internalMethod("Call") static #call(a) {} }',
    '@builtin({}) class A { @internalMethod("Call") static #a(a,b) {} @internalMethod("Call") static #b(a,b) {} }',
    '@builtin({}) class A { @internalSlot("Data") #data; }',
  ]
  for (const source of sources)
    assert.throws(() => compile_module(source), SyntaxError, source)
})

test("builtin hooks release temporary roots on success, exceptions and invalid results", async () => {
  await execute(`
    import {builtin_object_create, ordinary_define_own_property as ordinary} from "djs:intrinsics";
    @builtin({}) class Record {
      @internalMethod("Call") static #call(receiver,args) {return args[0]}
      @internalMethod("Construct") static #construct(args,target) {
        return builtin_object_create(target,target.prototype);
      }
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {
        return ordinary(this,key,descriptor);
      }
    }
    Record({});
    const record = new Record();
    record.value = {};
    const reason = {};
    @builtin({}) class Throws {
      @internalMethod("Call") static #call(receiver,args) {throw reason}
      @internalMethod("Construct") static #construct(args,target) {throw reason}
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {throw reason}
    }
    try { Throws() } catch (error) {}
    try { new Throws() } catch (error) {}
    @builtin({}) class Invalid {
      @internalMethod("Construct") static #construct(args,target) {return 1}
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {return 1}
    }
    try { new Invalid() } catch (error) {}
    @builtin({}) class ThrowDefine {
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {throw reason}
    }
    const throwing = new ThrowDefine();
    try { throwing.value = {} } catch (error) {}
    @builtin({}) class InvalidDefine {
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {return 1}
    }
    const invalid = new InvalidDefine();
    try { invalid.value = {} } catch (error) {}
  `)
})

test("per-class hook closures and layouts survive allocation-triggered moving GC", async () => {
  const { output, runtime, collections_before } = await execute(
    `
    import {ordinary_define_own_property as ordinary} from "djs:intrinsics";
    function make(label) {
      @builtin({}) class Record {
        @internalMethod("DefineOwnProperty")
        #define(key,descriptor) {thisMarker = label;return ordinary(this,key,descriptor)}
      }
      return new Record();
    }
    let thisMarker;
    const a=make("a");const b=make("b");
    let index=0;
    while(index<1000) {a.value=index;index=index+1}
    console.log(a.value,thisMarker);b.value=9;console.log(b.value,thisMarker);
  `,
    { semispace_bytes: 65536, root_capacity: 1, max_steps: 5000000 },
  )
  assert.equal(output, "999 a\n9 b\n")
  assert.ok(heap_stats(runtime.memory).collections > collections_before + 2)
  collect(runtime.memory)
})

test("string builtin layouts and wrapper data survive prototype replacement and moving GC", async () => {
  const { output, runtime, collections_before } = await execute(
    `
    import {ordinary_define_own_property as ordinary, string_value,
      set_prototype as setPrototype, object_create as create} from "djs:intrinsics";
    let marker;
    function make(label) {
      @builtin({prototype:"string"}) class Text {
        constructor() {this.initial = label}
        @internalMethod("DefineOwnProperty")
        #define(key, descriptor) {marker = label;return ordinary(this, key, descriptor)}
      }
      const text = new Text();
      console.log(string_value(Text.prototype), string_value(text), text.initial);
      const fake = create(Text.prototype);
      try {string_value(fake)} catch(error) {console.log(error.name)}
      return text;
    }
    const a = make("a");
    const b = make("b");
    const retained = new String("a😀z");
    setPrototype(a, null);
    let index = 0;
    while (index < 1000) {a.value = index;index = index + 1}
    console.log(a.value, marker, string_value(a));
    b.value = 7;
    console.log(b.value, marker, string_value(b));
    setPrototype(retained, null);
    console.log(string_value(retained), retained.length, retained[3]);
    const ordinaryString = new String("tail");
    console.log(ordinaryString.valueOf(), ordinaryString instanceof String);
  `,
    { semispace_bytes: 65536, root_capacity: 1, max_steps: 5000000 },
  )
  assert.equal(
    output,
    "  a\nTypeError\n  b\nTypeError\n999 a \n7 b \na😀z 4 z\ntail true\n",
  )
  assert.ok(heap_stats(runtime.memory).collections > collections_before + 2)
  collect(runtime.memory)
})
