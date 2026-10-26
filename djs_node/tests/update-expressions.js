let i = 0
const a = i++
const b = ++i
const c = i--
const d = --i
const o = { n: "5" }
const e = o.n++
o["n"]--
++o.n
console.log(a, b, c, d, i, e, typeof e, o.n)
