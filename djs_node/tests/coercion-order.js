const define = Object.defineProperty;
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
