const base = { a: 1, b: 2 }
const copy = {
  z: 0,
  ...base,
  b: 3,
  ...null,
  ...undefined,
  get c() {
    return "getter"
  },
}
console.log(copy.z, copy.a, copy.b, copy.c, copy === base)
const key = "k"
const more = {
  ...copy,
  [key]: "computed",
  method() {
    return "method"
  },
}
console.log(more.a, more.k, more.method(), more.c)
let keys = ""
for (const name in { ...base, extra: true }) keys += name
console.log(keys)
