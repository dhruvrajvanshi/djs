import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { bootstrap } from "../runtime/bootstrap.js"
import {
  create_runtime,
  load_module,
  evaluate_module,
} from "../runtime/modules.js"
import { compile_module } from "../compiler/compile.js"
import { disassemble_module } from "../compiler/disassemble.js"
import { collect, heap_stats } from "../vm/heap.js"

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
  assert.match(text, /BUILTIN_CLASS/)
  assert.match(text, /INTERNAL_METHOD.*hook=0/)
  assert.match(text, /INTERNAL_METHOD.*hook=2/)
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

test("Call, Construct and DefineOwnProperty hooks are hidden and independent of prototypes", async () => {
  const { output } = await execute(`
    import {call, builtin_object_create, define_property as define,
      ordinary_define_own_property as ordinary, ordinary_own_property_keys as keys,
      set_prototype as setPrototype, object_create as create} from "djs:intrinsics";
    let count = 0;
    @builtin({name:"Record",length:1})
    class Record {
      constructor() {throw "ordinary constructor was called"}
      @internalMethod("Call")
      static #invoke(receiver,args) {return {receiver,count:args.length,first:args[0]}}
      @internalMethod("Construct")
      static #make(args,newTarget) {
        const result = builtin_object_create(newTarget,newTarget.prototype);
        define(result,"value",{value:args[0],writable:true,configurable:true});
        return result;
      }
      @internalMethod("DefineOwnProperty")
      #define(key,descriptor) {
        count = count + 1;
        if (typeof key !== "string") throw "non-string key";
        if (key === "blocked") return false;
        return ordinary(this,key,descriptor);
      }
      read() {return this.value}
    }
    const receiver = {};
    const called = call(Record,receiver,1,2);
    console.log(called.receiver === receiver,called.count,called.first,Record(3).receiver===undefined);
    const record = new Record(7);
    console.log(record.read(),record instanceof Record,count,Record.name,Record.length);
    record[2]=9;
    try {define(record,"blocked",{value:1})} catch(e) {console.log(e.name)}
    console.log(count,record[2],"blocked" in record);
    Record.prototype.define = ()=>false;
    record.define = ()=>false;
    record.other=10;
    console.log(record.other,count,keys(Record).join(),keys(record).includes("#define"));
    const fake = create(Record.prototype);fake.value=5;console.log(count,fake.read());
    const read = Record.prototype.read;
    setPrototype(record,null);record.extra=11;
    console.log(record.extra,call(read,record),count);
  `)
  assert.equal(
    output,
    "true 2 1 true\n7 true 1 Record 1\nTypeError\n3 9 false\n10 5 prototype,name,length false\n5 5\n11 7 6\n",
  )
})

test("default construction allocates hook-bearing instances while ordinary classes stay ordinary", async () => {
  const { output } = await execute(`
    import {ordinary_define_own_property as ordinary} from "djs:intrinsics";
    let trace = "";
    @builtin({}) class Record {
      constructor(value) {this.value=value}
      @internalMethod("DefineOwnProperty")
      #define(key,descriptor) {trace=trace+key;return ordinary(this,key,descriptor)}
    }
    const record = new Record(4);record.other=5;
    console.log(record.value,record.other,trace,record instanceof Record);
    try {Record(1)} catch(e) {console.log(e.name)}
    class Plain {constructor() {this.value=6}}
    console.log(new Plain().value,trace);
  `)
  assert.equal(output, "4 5 valueother true\nTypeError\n6 valueother\n")
})

test("hook results are validated and guest exceptions retain their identity", async () => {
  const { output } = await execute(`
    const reason = {};
    @builtin({}) class BadResult {
      @internalMethod("Construct") static #construct(args,target) {return 1}
    }
    try {new BadResult()} catch(e) {console.log(e.name)}
    @builtin({}) class Throws {
      @internalMethod("Call") static #call(receiver,args) {throw reason}
      @internalMethod("Construct") static #construct(args,target) {throw reason}
    }
    try {Throws()} catch(e) {console.log(e===reason)}
    try {new Throws()} catch(e) {console.log(e===reason)}
    @builtin({}) class InvalidDefine {
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {return 1}
    }
    const invalid = new InvalidDefine();
    try {invalid.x=1} catch(e) {console.log(e.name)}
    @builtin({}) class ThrowDefine {
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {throw reason}
    }
    const throwing = new ThrowDefine();
    try {throwing.x=1} catch(e) {console.log(e===reason)}
    try {[1].length={valueOf(){throw reason}}} catch(e) {console.log(e===reason)}
  `)
  assert.equal(output, "TypeError\ntrue\ntrue\nTypeError\ntrue\ntrue\n")
})

test("array literals, definitions and mutations retain exotic behavior after prototype replacement", async () => {
  const { output } = await execute(`
    import {define_property as define, object_create as create, set_prototype as setPrototype} from "djs:intrinsics";
    const fake = create(Array.prototype);fake[5]=1;
    console.log(Array.isArray(fake),fake.length);
    const a = [];setPrototype(a,null);a[10]="x";
    console.log(Array.isArray(a),a.length,a[10]);
    define(a,"15",{value:"y",configurable:false});
    try {define(a,"length",{value:2,writable:false})} catch(e) {console.log(e.name)}
    console.log(a.length,a[15],10 in a);
    try {a[20]=1} catch(e) {console.log(e.name)}
    const sparse = Array(4294967295);sparse[4294967294]=1;sparse.length=0;
    console.log(sparse.length,4294967294 in sparse);
  `)
  assert.equal(
    output,
    "false 0\ntrue 11 x\nTypeError\n16 y true\nTypeError\n0 false\n",
  )
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
