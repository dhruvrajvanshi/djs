function capture(value) {
  return {
    read: () => () => arguments,
    own: function() { return arguments; }
  };
}
const first = capture("outer", 17);
const second = capture("other");
console.log(first.read()().length, first.read()()[0], first.read()()[1]);
console.log(second.read()()[0], first.own("inner")[0], first.own().length);
function parameter(arguments) { return () => arguments; }
function local() { const arguments = "local"; return () => arguments; }
function shadow() {
  { const arguments = "block"; console.log(arguments); }
  return arguments[0];
}
console.log(parameter("parameter")(), local()(), shadow("function"));
console.log(typeof arguments, (() => typeof arguments)());
const object = { method() { return arguments[0]; } };
class Box { constructor() { this.value = arguments[0]; } }
console.log(object.method("method"), new Box("constructor").value);
