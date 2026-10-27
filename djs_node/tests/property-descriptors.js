const call = (f, receiver, ...args) => f.call(receiver, ...args);
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const create = Object.create;
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
