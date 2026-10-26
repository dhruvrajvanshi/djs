function inspect(first, missing) {
  first = "parameter";
  console.log(arguments.length, arguments[0], arguments[1], arguments[2], missing);
  arguments[0] = "argument";
  console.log(first, arguments[0]);
  return arguments;
}
const saved = inspect("original");
const empty = inspect();
console.log(saved.length, saved[0], saved === empty);
function replace(value) {
  arguments = { length: 1, "0": value };
  return arguments[0];
}
console.log(replace("replacement"));
