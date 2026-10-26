import console, { log } from "node:console";
log();
log("hello", "world");
log(undefined, null, true, false, 0, -0, 42, NaN, Infinity);
log({}, function() {}, new TypeError("failure"));
log("%s", "literal", "line\nbreak", "😀");
console.log(log === console.log, log("return") === undefined);
console.log(Error.prototype, TypeError.prototype);
console.log(new Error(new TypeError("nested")));
const error = new Error(null);
error.name = 42;
const object = {
  name: "Error", message: "ordinary",
  toString() { throw "unexpected coercion"; }
};
console.log(error, object);
console.log(-Infinity, 1.25, 1e21, 1e-7);
