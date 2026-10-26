const token = { value: 42 };
let cleaned = 0;
function unwind(depth) {
  try {
    if (depth === 0) throw token;
    return unwind(depth - 1);
  } finally {
    cleaned = cleaned + 1;
  }
}
try { unwind(24); }
catch (error) { console.log(error === token, cleaned); }

async function preserve() {
  try { return token; }
  finally { await Promise.resolve(); }
}
console.log((await preserve()) === token);

async function replace() {
  try { throw token; }
  finally {
    await Promise.resolve();
    return 99;
  }
}
console.log(await replace());
