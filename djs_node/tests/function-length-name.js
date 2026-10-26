import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
function plain(a, b) {return arguments.length}
function optional(a, b = 2, c) {return [a, b, c, arguments.length].join("|")}
function collect(first, ...rest) {
  rest[0] = "changed";
  return [Array.isArray(rest), rest.length, rest.join("|"), arguments[1]];
}
function defaults(a = 1, ...rest) {return a + rest.length}
const arrow = (a, b = 2, ...rest) => [a, b, rest.length].join("|");
class Example {
  constructor(a, b = 2, ...rest) {this.count = rest.length}
  method(a, b = 2) {return b}
  static all(...items) {return items}
  ["computed"](a, b, c = 3) {return c}
  get value() {return 1}
  set value(next) {}
  #hidden(...items) {return items}
  reveal() {return this.#hidden}
}
const object = {method(a, b = 2) {}, [17](a) {},
  get value() {return 1}, set value(next) {}};
console.log(plain.name, plain.length, plain(1,2,3));
console.log(optional.name, optional.length, optional(1), optional(1,undefined,3));
console.log(collect.name, collect.length, collect(1,2,3).join("/"), collect().join("/"));
console.log(defaults.length, defaults(), defaults(undefined, 2, 3));
console.log(arrow.length, arrow(1,undefined,3,4));
console.log(Example.name, Example.length, new Example(1,2,3,4).count);
console.log(Example.prototype.method.name, Example.prototype.method.length);
console.log(Example.all.name, Example.all.length, Example.all(1,2).join());
console.log(Example.prototype.computed.name, Example.prototype.computed.length);
console.log(descriptor(Example.prototype,"value").get.name,
  descriptor(Example.prototype,"value").set.name);
console.log(new Example().reveal().name, new Example().reveal().length);
console.log(object.method.name, object.method.length, object[17].name, object[17].length);
console.log(descriptor(object,"value").get.name, descriptor(object,"value").set.length);
let coercions = 0;
const key = {toString() {coercions = coercions + 1;return "dynamic"}};
class Dynamic {[key](a = 1) {return a}}
const dynamic = {[key](a, ...rest) {return rest}};
console.log(coercions, Dynamic.prototype.dynamic.name, Dynamic.prototype.dynamic.length,
  dynamic.dynamic.name, dynamic.dynamic.length);
