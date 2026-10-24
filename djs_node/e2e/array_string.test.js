import assert from "node:assert/strict"
import test from "node:test"
import { execute } from "./helpers.js"

// Compare observable operations against Node, mapping the guest intrinsics to
// their standard host counterparts without requiring spread syntax in DJS.
async function equivalent(t, source) {
  let expected = ""
  const console = {
    log(...values) {
      expected += values.map(String).join(" ") + "\n"
    },
  }
  new Function(
    "console",
    "call",
    "define",
    "descriptor",
    "setPrototype",
    "create",
    `"use strict";\n${source}`,
  )(
    console,
    (fn, receiver, ...args) => Reflect.apply(fn, receiver, args),
    Object.defineProperty,
    Object.getOwnPropertyDescriptor,
    Object.setPrototypeOf,
    Object.create,
  )
  const result = await execute(
    t,
    `import { call, define_property as define,
    get_own_property_descriptor as descriptor, set_prototype as setPrototype,
    object_create as create } from "djs:intrinsics";\n${source}`,
  )
  assert.equal(result.output, expected)
  return result
}

test("array literals, constructors, indices and holes follow array length rules", async (t) => {
  await equivalent(
    t,
    `
    const a = [1,,undefined,];
    console.log(a.length, 0 in a, 1 in a, 2 in a, a.join("|"));
    console.log(Array.isArray(a), Array.isArray(Array.prototype), Array.isArray({}), a instanceof Array);
    console.log(Array().length, Array(3).length, 0 in Array(3), new Array(1,2).join("-"));
    a[5] = "end"; a["01"] = 9; a["4294967295"] = 8;
    console.log(a.length, a["01"], a["4294967295"]);
    delete a[0]; console.log(a.length, 0 in a);
    a.length = "2"; console.log(a.length, 2 in a, 5 in a);
    a.length = 4; console.log(a.length, 2 in a);
    console.log(Array.of(4).join(), Array.from({0:"a", 2:"c", length:3}).join("|"));
    console.log(Array.from("A😀B").length, Array.from("A😀B").join("|"));
    try { Array(-1) } catch (e) { console.log(e.name) }
    try { a.length = 1.5 } catch (e) { console.log(e.name) }
    console.log(Array.name, Array.length, Array.prototype.push.name, Array.prototype.push.length);
    const zero = Array(-0);console.log(1 / zero.length);zero.length = -0;console.log(1 / zero.length);
    const oldPoint = String.prototype.codePointAt;
    const oldSlice = String.prototype.slice;
    try {
      String.prototype.codePointAt = () => {throw "patched"};
      String.prototype.slice = () => {throw "patched"};
      console.log(Array.from("A😀B").join("|"));
    } finally {
      String.prototype.codePointAt = oldPoint;
      String.prototype.slice = oldSlice;
    }
  `,
  )
})

test("array length truncation preserves descriptor invariants and partial failure", async (t) => {
  await equivalent(
    t,
    `
    const a = [0,1,2,3,4];
    define(a, "2", {configurable:false});
    try { define(a,"length",{value:1,writable:false}) } catch(e) { console.log(e.name) }
    const d = descriptor(a,"length");
    console.log(a.length, d.writable, d.enumerable, d.configurable, 3 in a, 4 in a, a[2]);
    try { a[3] = 9 } catch(e) { console.log(e.name) }
    a[0] = 7; console.log(a[0]);
    try { a.length = 3 } catch(e) { console.log(e.name) }
    try { delete a.length } catch(e) { console.log(e.name) }
    let calls = 0;
    try { a.length = {valueOf(){calls=calls+1;return 3}} } catch(e) {console.log(e.name,calls)}
    define(a,"length",{value:3});
    try { define(a,"length",{writable:true}) } catch(e) { console.log(e.name) }
    const b = [];
    define(b,"5",{value:"x",writable:true,configurable:true});
    console.log(b.length, b[5], descriptor(b,"5").enumerable);
  `,
  )
})

test("array methods preserve holes and inherited elements on generic receivers", async (t) => {
  await equivalent(
    t,
    `
    const prototype = {1:7};
    const object = create(prototype);
    object[0] = 2; object.length = 4;
    const mapped = call(Array.prototype.map, object, (x,i) => x + i);
    console.log(mapped.join("|"), 1 in mapped, 2 in mapped);
    console.log(call(Array.prototype.filter, object, x => x > 3).join());
    console.log(call(Array.prototype.reduce, object, (a,b) => a+b, 0));
    console.log(call(Array.prototype.slice, object).join("|"));
    let trace = "";
    call(Array.prototype.find, object, (x,i) => {trace = trace + i; return false});
    console.log(trace);
    trace = "";
    call(Array.prototype.forEach, object, (x,i) => {trace = trace + i; object[2] = 9});
    console.log(trace);
    console.log(call(Array.prototype.join,"abc","-"));
    const receiver = {base:10};
    console.log([1,2].map(function(x) {return this.base+x}, receiver).join());
    console.log([,].includes(undefined), [,].indexOf(undefined), [NaN].includes(NaN));
    console.log([1,2,1].lastIndexOf(1), [1,2,1].lastIndexOf(1,undefined));
  `,
  )
})

test("array mutation, sorting, flattening and copy methods agree with Node", async (t) => {
  await equivalent(
    t,
    `
    const a = [1,,3];
    console.log(a.push(4,5),a.pop(),a.shift(),a.unshift(7,8),a.join("|"));
    console.log(a.splice(1,2,"a","b","c").join("|"),a.join("|"));
    console.log(a.reverse().join("|"),a.fill(9,-2).join("|"));
    console.log([1,,3,4].copyWithin(1,0,3).join("|"));
    console.log([1,,3].concat([4,,6],7).join("|"));
    console.log([3,undefined,,1,2].sort().join("|"));
    const stable = [{k:1,v:"a"},{k:0,v:"b"},{k:1,v:"c"}];
    console.log(stable.sort((a,b)=>a.k-b.k).map(x=>x.v).join());
    console.log([1,[2,,[3]],,4].flat(2).join());
    console.log([1,2].flatMap(x=>[x,x*2]).join());
    console.log([1,,3].toReversed().join("|"),1 in [1,,3].toReversed());
    console.log([3,,1].toSorted().join("|"),2 in [3,,1].toSorted());
    console.log([1,2,3].with(-1,9).join(),[1,2,3].toSpliced(1,1,7,8).join());
    console.log([1,2,3].reduceRight((a,b)=>a-b), [1,2,3].findLast(x=>x<3), [1,2,3].findLastIndex(x=>x<3));
    console.log([].every(()=>false),[].some(()=>true),[1,2].at(-1));
    const cyclic = [1]; cyclic[1] = cyclic; console.log(cyclic.join());
    try { [].reduce((a,b)=>a+b) } catch(e) {console.log(e.name)}
    try { [1].with(2,0) } catch(e) {console.log(e.name)}
    try { new Array.prototype.map() } catch(e) {console.log(e.name)}
  `,
  )
})

test("array iterators observe length changes and remain completed", async (t) => {
  await equivalent(
    t,
    `
    const a = [1,,3]; const values = a.values();
    console.log(values.next().value); a[1]=2;
    console.log(values.next().value); a.push(4);
    console.log(values.next().value,values.next().value,values.next().done);
    a.push(5);console.log(values.next().done);
    console.log(a.keys().next().value,a.entries().next().value.join());
  `,
  )
})

test("String call, construction, wrapper branding and virtual descriptors agree with Node", async (t) => {
  await equivalent(
    t,
    `
    console.log(String(),String(undefined),String(null),String(123));
    const s = new String("a😀z");
    console.log(typeof s,s instanceof String,s.length,s[0],s[3],String(s),s.valueOf());
    console.log(typeof String.prototype,String.prototype.length,String.prototype.valueOf());
    const d = descriptor(s,"1");
    console.log(d.value.charCodeAt(0),d.writable,d.enumerable,d.configurable);
    const l = descriptor(s,"length"); console.log(l.value,l.writable,l.enumerable,l.configurable);
    try { s[0] = "x" } catch(e) {console.log(e.name)}
    try { s.length = 2 } catch(e) {console.log(e.name)}
    try { delete s[0] } catch(e) {console.log(e.name)}
    define(s,"0",{value:"a"});s.extra=4; console.log(s.extra,1 in s);
    try { call(String.prototype.valueOf,{}) } catch(e) {console.log(e.name)}
    console.log(call(String.prototype.charAt,1234,2),String.name,String.length);
    try { new String.prototype.slice() } catch(e) {console.log(e.name)}
  `,
  )
})

test("string code-unit and code-point operations preserve surrogate code units", async (t) => {
  await equivalent(
    t,
    `
    const s = "a😀z";
    console.log(s.length,s.charCodeAt(1),s.charCodeAt(2),s.codePointAt(1),s.codePointAt(2));
    console.log(s.at(-1),s.charAt(99),s.charCodeAt(99),s.codePointAt(99));
    console.log(String.fromCharCode(-1,65536,65).charCodeAt(0),String.fromCharCode(65536).length);
    console.log(String.fromCodePoint(65,128512),String.fromCodePoint(55296).charCodeAt(0));
    console.log("😀".isWellFormed(),"\\ud800x\\udfff".isWellFormed());
    console.log("\\ud800x\\udfff".toWellFormed(),"😀".toWellFormed());
    try { String.fromCodePoint(1.1) } catch(e) {console.log(e.name)}
    try { String.fromCodePoint(Infinity) } catch(e) {console.log(e.name)}
  `,
  )
})

test("string searching, slicing, splitting, padding and trimming agree with Node", async (t) => {
  await equivalent(
    t,
    `
    const s = "abcabc";
    console.log(s.slice(-4,-1),s.substring(5,1),s.substring(-3,2));
    console.log(s.indexOf("bc",2),s.lastIndexOf("bc"),s.lastIndexOf("",NaN));
    console.log(s.includes("ab",3),s.startsWith("bc",1),s.endsWith("ab",5));
    console.log(s.split("b").join("|"),"a,,b,".split(",").join("|"));
    console.log("😀".split("").length,"".split("").length,"".split(",").length);
    console.log("abc".split(undefined,0).length,"abc".split("",2).join("|"));
    console.log("a".padStart(6,"bc"),"a".padEnd(6,"bc"),"x".repeat(3),"x".repeat(-0.5));
    console.log("\\ufeff\\u2000 x \\u3000".trim(),"  x  ".trimStart(),"  x  ".trimEnd());
    console.log(String.raw({raw:["a","b","c"]},1,2),"a".concat(1,null));
    try { "a".repeat(-1) } catch(e) {console.log(e.name)}
    try { call(String.prototype.slice,null) } catch(e) {console.log(e.name)}
  `,
  )
})

test("string replacements implement substitutions, functions and empty searches", async (t) => {
  await equivalent(
    t,
    `
    console.log("abcabc".replace("bc","[$&]-$$-$1"));
    console.log("abcabc".replaceAll("bc",(match,index,text)=>match+index+text.length));
    console.log("abc".replaceAll("","-"),"".replaceAll("","-"));
    console.log("abc".replace("b","$"+"\u0060"+"/$'"));
    let calls = 0;
    console.log("abc".replace("z",()=>{calls=calls+1;return "x"}),calls);
    console.log("abc".replaceAll("b",{toString(){return "!"}}));
  `,
  )
})

test("coercion runs user methods in order and preserves thrown guest identity", async (t) => {
  await equivalent(
    t,
    `
    let trace = "";
    const object = {valueOf(){trace=trace+"v";return 7},toString(){trace=trace+"s";return "text"}};
    console.log(String(object),+object,object+1,object==7,trace);
    const key = {toString(){return "value"}};
    const target = {}; target[key]=42;console.log(target[key],key in target);delete target[key];
    console.log("value" in target);
    let count = 0;
    const length = {valueOf(){count=count+1;return 2}};
    const array = [1,2,3];array.length=length;console.log(array.length,count);
    define(array,"length",{value:length});console.log(array.length,count);
    const reason = {};
    const bad = {valueOf(){throw reason},toString(){throw reason}};
    try { +bad } catch(e) {console.log(e===reason)}
    try { String(bad) } catch(e) {console.log(e===reason)}
    try { target[bad] } catch(e) {console.log(e===reason)}
    console.log(+new String("12"),new String("x")+"y",[1,2]+"!",String({}));
    console.log([new TypeError("failure")].join());
    console.log({} == null,{} == undefined);
  `,
  )
})

test("new.target is lexical in arrows and constructors can return exotic objects", async (t) => {
  await equivalent(
    t,
    `
    function F() { return ()=>new.target }
    const read = new F();console.log(read()===F,F()()===undefined);
    function C() { return [arguments.length,arguments[0]] }
    console.log(new C(4).join(),call(Array.of,C,7,8).join());
    console.log(call(Array.of,()=>{},4,5).join());
    console.log(call(Array.from,C,{0:"x",length:1}).join());
  `,
  )
})

test("descriptor changes preserve accessors and reject incompatible redefinitions", async (t) => {
  await equivalent(
    t,
    `
    const getter = function() { return 7 };
    const setter = function(value) {this.saved=value};
    const object = {};
    define(object,"x",{get:getter,set:setter,configurable:true});
    define(object,"x",{enumerable:true,configurable:false});
    define(object,"x",{});
    const d = descriptor(object,"x");
    console.log(object.x,d.get===getter,d.set===setter,d.configurable,d.enumerable);
    object.x=9;console.log(object.saved);
    try {define(object,"x",{get:()=>8})} catch(e) {console.log(e.name)}
    try {define(object,"x",{configurable:true})} catch(e) {console.log(e.name)}
    try {delete object.x} catch(e) {console.log(e.name)}
    define(object,"nan",{value:NaN});define(object,"nan",{value:NaN});
    define(object,"zero",{value:0});
    try {define(object,"zero",{value:-0})} catch(e) {console.log(e.name)}
    const prototype = {};
    define(prototype,"1",{get(){return 8}});
    define(prototype,"0",{set(value){throw "setter"}});
    const source = create(prototype);source.length=3;
    console.log(call(Array.prototype.map,source,x=>x*2).join("|"));
    define(Array.prototype,"0",{set(){throw "setter"},configurable:true});
    console.log([1].map(x=>x+1).join(),Array.from({0:"x",length:1}).join());
    delete Array.prototype[0];
    Array.prototype.length = 0;
  `,
  )
})

test("Array methods derive names, lengths and descriptors from class syntax", async (t) => {
  await equivalent(
    t,
    `
    function inspect(owner, key) {
      const method = owner[key];
      const property = descriptor(owner, key);
      const name = descriptor(method, "name");
      const length = descriptor(method, "length");
      console.log(key, method.name, method.length,
        property.writable, property.enumerable, property.configurable,
        name.writable, name.enumerable, name.configurable,
        length.writable, length.enumerable, length.configurable);
      try { new method() } catch (error) { console.log(error.name) }
    }
    const statics = ["isArray", "of", "from"];
    const methods = ["at", "push", "pop", "shift", "unshift", "join", "toString",
      "slice", "concat", "reverse", "fill", "copyWithin", "splice", "keys",
      "values", "entries", "forEach", "map", "filter", "some", "every", "find",
      "findIndex", "findLast", "findLastIndex", "reduce", "reduceRight", "indexOf",
      "lastIndexOf", "includes", "sort", "flat", "flatMap", "toReversed", "with",
      "toSorted", "toSpliced"];
    let index = 0;
    while (index < statics.length) {
      inspect(Array, statics[index]); index = index + 1;
    }
    index = 0;
    while (index < methods.length) {
      inspect(Array.prototype, methods[index]); index = index + 1;
    }
    console.log(Array.of().length, Array.of(undefined, 2, 3).join("|"));
    console.log(Array.prototype.valueOf() === Array.prototype);
    define(Array.prototype.map, "name", {value:"renamed"});
    define(Array.prototype.map, "length", {value:7});
    console.log(Array.prototype.map.name, Array.prototype.map.length);
  `,
  )
})

test("ordinary functions and methods expose JavaScript parameter lengths and method names", async (t) => {
  await equivalent(
    t,
    `
    function plain(a, b) {return arguments.length}
    function optional(a, b = 2, c) {return [a, b, c, arguments.length].join("|")}
    function collect(first, ...rest) {
      rest[0] = "changed";
      return [Array.isArray(rest), rest.length, rest.join("|"), arguments[1]];
    }
    function defaults(a = 1, ...rest) {return a + rest.length}
    const arrow = (a, b = 2, ...rest) => [a, b, rest.length].join("|");
    class Example {
      constructor(a, b = 2, ...rest) {this.count = rest.length}
      method(a, b = 2) {return b}
      static all(...items) {return items}
      ["computed"](a, b, c = 3) {return c}
      get value() {return 1}
      set value(next) {}
      #hidden(...items) {return items}
      reveal() {return this.#hidden}
    }
    const object = {method(a, b = 2) {}, [17](a) {},
      get value() {return 1}, set value(next) {}};
    console.log(plain.name, plain.length, plain(1,2,3));
    console.log(optional.name, optional.length, optional(1), optional(1,undefined,3));
    console.log(collect.name, collect.length, collect(1,2,3).join("/"), collect().join("/"));
    console.log(defaults.length, defaults(), defaults(undefined, 2, 3));
    console.log(arrow.length, arrow(1,undefined,3,4));
    console.log(Example.name, Example.length, new Example(1,2,3,4).count);
    console.log(Example.prototype.method.name, Example.prototype.method.length);
    console.log(Example.all.name, Example.all.length, Example.all(1,2).join());
    console.log(Example.prototype.computed.name, Example.prototype.computed.length);
    console.log(descriptor(Example.prototype,"value").get.name,
      descriptor(Example.prototype,"value").set.name);
    console.log(new Example().reveal().name, new Example().reveal().length);
    console.log(object.method.name, object.method.length, object[17].name, object[17].length);
    console.log(descriptor(object,"value").get.name, descriptor(object,"value").set.length);
    let coercions = 0;
    const key = {toString() {coercions = coercions + 1;return "dynamic"}};
    class Dynamic {[key](a = 1) {return a}}
    const dynamic = {[key](a, ...rest) {return rest}};
    console.log(coercions, Dynamic.prototype.dynamic.name, Dynamic.prototype.dynamic.length,
      dynamic.dynamic.name, dynamic.dynamic.length);
  `,
  )
})

test("String methods derive names, lengths and descriptors from class syntax", async (t) => {
  await equivalent(
    t,
    `
    function inspect(owner, key) {
      const method = owner[key];
      const property = descriptor(owner, key);
      const name = descriptor(method, "name");
      const length = descriptor(method, "length");
      console.log(key, method.name, method.length,
        property.writable, property.enumerable, property.configurable,
        name.writable, name.enumerable, name.configurable,
        length.writable, length.enumerable, length.configurable);
      try { new method() } catch (error) { console.log(error.name) }
    }
    const statics = ["fromCharCode", "fromCodePoint", "raw"];
    const methods = ["toString", "valueOf", "at", "charAt", "charCodeAt", "codePointAt",
      "concat", "slice", "substring", "indexOf", "lastIndexOf", "includes", "startsWith",
      "endsWith", "repeat", "split", "trim", "trimStart", "trimEnd", "padStart", "padEnd",
      "replace", "replaceAll", "isWellFormed", "toWellFormed"];
    let index = 0;
    while (index < statics.length) {
      inspect(String, statics[index]); index = index + 1;
    }
    index = 0;
    while (index < methods.length) {
      inspect(String.prototype, methods[index]); index = index + 1;
    }
    const prototype = descriptor(String, "prototype");
    const constructor = descriptor(String.prototype, "constructor");
    console.log(String.name, String.length, prototype.writable, prototype.enumerable,
      prototype.configurable, constructor.value === String, constructor.writable,
      constructor.enumerable, constructor.configurable);
    console.log(String.fromCharCode(), String.fromCodePoint(), new String().length,
      new String(undefined).valueOf(), call(String, {}, 123, 456));
    define(String.prototype.slice, "name", {value:"renamed"});
    define(String.prototype.slice, "length", {value:7});
    console.log(String.prototype.slice.name, String.prototype.slice.length);
  `,
  )
})

test("String wrappers retain branding and virtual properties after prototype replacement", async (t) => {
  await equivalent(
    t,
    `
    const unbox = String.prototype.valueOf;
    const text = new String("a😀z");
    setPrototype(text, null);
    console.log(call(unbox, text), text.length, text[0], text[3], 1 in text);
    const index = descriptor(text, "0");
    console.log(index.value, index.writable, index.enumerable, index.configurable);
    try {text[0] = "b"} catch (error) {console.log(error.name)}
    text.extra = 5; console.log(text.extra);
    const fake = create(String.prototype);
    try {call(unbox, fake)} catch (error) {console.log(error.name)}
    const reason = {};
    try {String({toString(){throw reason}})} catch (error) {console.log(error === reason)}
    try {new String({toString(){throw reason}})} catch (error) {console.log(error === reason)}
  `,
  )
})
