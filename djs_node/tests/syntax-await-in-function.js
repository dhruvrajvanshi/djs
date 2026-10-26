function f() { return await Promise.resolve(1); }
console.log("unreachable");
