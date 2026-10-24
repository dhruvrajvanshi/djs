async function add(a, b) {
  console.log("start", a);
  const x = await a;
  console.log("resumed", x);
  return x + await Promise.resolve(b);
}
async function fail() { await null; throw "boom"; }
async function early() { throw "early"; }
const obj = { base: 10, async method(v) { return this.base + await v; } };
class C { async m() { return await 5; } }
const p = add(1, 2);
console.log(p instanceof Promise, typeof (async function () {}));
console.log("sync");
console.log(await p);
try { await fail(); } catch (e) { console.log("caught", e); }
early().catch((e) => console.log("rejected", e));
console.log(await obj.method(Promise.resolve(3)), await new C().m());
let order = "";
async function tick(name) { order = order + name + 1; await null; order = order + name + 2; }
tick("a"); tick("b");
await null;
console.log(order);
try { new add(); } catch (e) { console.log(e instanceof TypeError); }
