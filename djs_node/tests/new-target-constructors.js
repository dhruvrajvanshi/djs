const call = (f, receiver, ...args) => f.call(receiver, ...args);
function F() { return ()=>new.target }
const read = new F();console.log(read()===F,F()()===undefined);
function C() { return [arguments.length,arguments[0]] }
console.log(new C(4).join(),call(Array.of,C,7,8).join());
console.log(call(Array.of,()=>{},4,5).join());
console.log(call(Array.from,C,{0:"x",length:1}).join());
