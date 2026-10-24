const p = Promise.resolve(17);
Promise.resolve = () => { throw "patched resolve"; };
Promise.prototype.then = () => { throw "patched then"; };
console.log(await p);
console.log(await { then(resolve) { resolve(18); } });
const reason = { value: 19 };
try {
  try { await Promise.reject(reason); }
  finally { console.log("finally"); }
} catch (error) { console.log(error === reason); }
