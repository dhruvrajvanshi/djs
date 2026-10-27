const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
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
