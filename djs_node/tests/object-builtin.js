class Foo {}
const plain = {}
const box = Object("s")
console.log(typeof Object, Object.name, Object.length)
console.log(
  Object.prototype.constructor === Object,
  Object.prototype instanceof Object,
)
console.log(
  plain instanceof Object,
  [] instanceof Object,
  new Foo() instanceof Object,
)
console.log(Object(plain) === plain, new Object(plain) === plain)
console.log(Object() instanceof Object, new Object() instanceof Object)
console.log(box instanceof String, box.length)
console.log(String(plain), plain.valueOf() === plain)
