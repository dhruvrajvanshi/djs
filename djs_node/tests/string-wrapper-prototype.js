import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
const unbox = String.prototype.valueOf;
const text = new String("a😀z");
setPrototype(text, null);
console.log(call(unbox, text), text.length, text[0], text[3], 1 in text);
const index = descriptor(text, "0");
console.log(index.value, index.writable, index.enumerable, index.configurable);
try {text[0] = "b"} catch (error) {console.log(error.name)}
text.extra = 5; console.log(text.extra);
const fake = create(String.prototype);
try {call(unbox, fake)} catch (error) {console.log(error.name)}
const reason = {};
try {String({toString(){throw reason}})} catch (error) {console.log(error === reason)}
try {new String({toString(){throw reason}})} catch (error) {console.log(error === reason)}
