import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
const s = "abcabc";
console.log(s.slice(-4,-1),s.substring(5,1),s.substring(-3,2));
console.log(s.indexOf("bc",2),s.lastIndexOf("bc"),s.lastIndexOf("",NaN));
console.log(s.includes("ab",3),s.startsWith("bc",1),s.endsWith("ab",5));
console.log(s.split("b").join("|"),"a,,b,".split(",").join("|"));
console.log("😀".split("").length,"".split("").length,"".split(",").length);
console.log("abc".split(undefined,0).length,"abc".split("",2).join("|"));
console.log("a".padStart(6,"bc"),"a".padEnd(6,"bc"),"x".repeat(3),"x".repeat(-0.5));
console.log("\ufeff\u2000 x \u3000".trim(),"  x  ".trimStart(),"  x  ".trimEnd());
console.log(String.raw({raw:["a","b","c"]},1,2),"a".concat(1,null));
try { "a".repeat(-1) } catch(e) {console.log(e.name)}
try { call(String.prototype.slice,null) } catch(e) {console.log(e.name)}
