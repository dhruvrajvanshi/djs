const [a, , b = 3, ...rest] = [1, 2, undefined, 4, 5]
const {
  x,
  y: { z },
  w = "default",
  ["k" + 1]: k,
} = { x: 1, y: { z: 2 }, k1: "computed" }
console.log(a, b, rest.join(","), x, z, w, k)
function f({ s = 1, t } = {}, [u, v] = [7, 8]) {
  return [s, t, u, v].join(",")
}
console.log(f(), f({ t: 2 }, [9]))
const pairs = [
  [1, "one"],
  [2, "two"],
]
for (const [n, name] of pairs) console.log(n, name)
let p = 1
let q = 2
;[p, q] = [q, p]
const o = {}
;({ a: o.first, b: q } = { a: "A", b: "B" })
console.log(p, q, o.first)
try {
  throw { code: 42 }
} catch ({ code }) {
  console.log(code)
}
const captured =
  ({ c }) =>
  () =>
    c
console.log(captured({ c: "closure" })())
