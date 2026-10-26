await Promise.resolve().then(() => { throw new TypeError("handler"); });
console.log("unreachable");
