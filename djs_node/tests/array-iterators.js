import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
const a = [1,,3]; const values = a.values();
console.log(values.next().value); a[1]=2;
console.log(values.next().value); a.push(4);
console.log(values.next().value,values.next().value,values.next().done);
a.push(5);console.log(values.next().done);
console.log(a.keys().next().value,a.entries().next().value.join());
