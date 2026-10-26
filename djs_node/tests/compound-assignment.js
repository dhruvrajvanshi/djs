let s = "a"
s += "b"
let n = 10
n -= 3
n *= 2
n **= 2
n >>= 1
const o = { x: 1, y: null, z: 0 }
o.x += 5
o["x"] <<= 1
o.y ??= "set"
o.x ??= "unchanged"
o.z ||= 7
o.z &&= 8
let calls = 0
function key() {
  calls++
  return "x"
}
o[key()] += 1
console.log(s, n, o.x, o.y, o.z, calls)
