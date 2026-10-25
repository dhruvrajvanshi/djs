const values = [];
for (const value of [1, 2, 3]) values.push(value * 2);
console.log(values.join(","));

const chars = [];
for (const char of "a😀b") chars.push(char);
console.log(chars.length, chars[1] === "😀");

const fns = [];
for (let item of ["x", "y"]) fns.push(() => item);
console.log(fns[0](), fns[1]());

const entries = [];
for (const entry of ["p", "q"].entries()) entries.push(entry[0] + entry[1]);
console.log(entries.join(","));
console.log([][Symbol.iterator] === [].values);

let last;
for (last of [4, 5]) {}
console.log(last);

function counter(limit, log) {
  let count = 0;
  return {
    [Symbol.iterator]() { return this; },
    next() {
      count = count + 1;
      return { value: count, done: count > limit };
    },
    return() {
      log.push("return " + count);
      return {};
    },
  };
}

const log = [];
for (const n of counter(3, log)) log.push(n);
for (const n of counter(5, log)) {
  if (n === 2) continue;
  if (n === 3) break;
  log.push(n);
}
function early() {
  for (const n of counter(5, log)) {
    try {
      if (n === 2) return n;
    } finally {
      log.push("finally " + n);
    }
  }
}
early();
try {
  for (const n of counter(5, log)) throw new Error("boom " + n);
} catch (error) {
  log.push(error.message);
}
for (const n of counter(5, log)) {
  for (const m of counter(5, log)) {
    if (m === 2) break;
  }
  break;
}
console.log(log.join("|"));

try {
  for (const n of {
    [Symbol.iterator]() { return this; },
    next() { return { value: 1, done: false }; },
    return() { throw new Error("from return"); },
  }) throw new Error("from body");
} catch (error) {
  console.log(error.message);
}

try {
  for (const n of {
    [Symbol.iterator]() { return this; },
    next() { return { value: 1, done: false }; },
    return() { throw new Error("from return"); },
  }) break;
} catch (error) {
  console.log(error.message);
}

try {
  for (const n of 5) {}
} catch (error) {
  console.log(error.name);
}

try {
  let tdz = [1];
  for (let tdz of tdz) {}
} catch (error) {
  console.log(error.name);
}

class Base {
  hidden() {}
}
Base.prototype.inherited = 1;
Base.prototype.shadowed = 2;
const derived = new Base();
derived.own = 3;
derived.shadowed = 4;
const keys = [];
for (const key in derived) keys.push(key + "=" + derived[key]);
console.log(keys.join(","));

const indices = [];
for (const key in ["a", "b"]) indices.push(key, typeof key);
console.log(indices.join(","));

const deleting = { a: 1, b: 2, c: 3 };
const seen = [];
for (const key in deleting) {
  seen.push(key);
  delete deleting.b;
}
console.log(seen.join(","));

let none = 0;
for (const key in null) none = none + 1;
for (const key in undefined) none = none + 1;
console.log(none);

let assigned;
for (assigned in { only: 1 }) {}
console.log(assigned);
