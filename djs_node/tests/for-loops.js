let sum = 0;
for (let i = 0; i < 5; i = i + 1) sum = sum + i;
console.log(sum);

const fns = [];
for (let i = 0; i < 3; i = i + 1) fns.push(() => i);
console.log(fns[0](), fns[1](), fns[2]());

const updates = [];
for (let i = 0; i < 3; i = i + 1) {
  updates.push(() => i);
  i = i + 1;
}
console.log(updates.length, updates[0](), updates[1]());

const bodies = [];
let n = 0;
while (n < 3) {
  const m = n * 10;
  bodies.push(() => m);
  n = n + 1;
}
console.log(bodies[0](), bodies[1](), bodies[2]());

for (const limit = 2; sum > limit; ) {
  sum = sum - limit;
}
console.log(sum);

let j = 0;
for (j = 10; j < 13; j = j + 1) {}
console.log(j);

let count = 0;
for (;;) {
  count = count + 1;
  if (count === 4) break;
}
console.log(count);

const odds = [];
for (let i = 0; i < 6; i = i + 1) {
  if (i % 2 === 0) continue;
  odds.push(i);
}
console.log(odds.join(","));

const log = [];
for (let i = 0; i < 3; i = i + 1) {
  let captured = i;
  try {
    if (i === 1) continue;
    if (i === 2) break;
    log.push("body " + captured);
  } finally {
    log.push("finally " + captured + " " + (() => i)());
  }
}
console.log(log.join("|"));

function nested() {
  for (let i = 0; i < 3; i = i + 1) {
    try {
      try {
        for (let k = 0; k < 3; k = k + 1) {
          if (k === 1) break;
        }
        if (i === 1) break;
      } catch (e) {
        console.log("unreachable");
      } finally {
        console.log("inner", i);
      }
    } finally {
      console.log("outer", i);
    }
  }
  return "done";
}
console.log(nested());

let w = 0;
while (true) {
  w = w + 1;
  try {
    if (w < 3) continue;
    break;
  } catch (e) {}
}
console.log(w);

const errors = [];
for (let i = 0; i < 2; i = i + 1) {
  try {
    throw i;
  } catch (e) {
    const value = e;
    errors.push(() => value + i);
  }
}
console.log(errors[0](), errors[1]());
