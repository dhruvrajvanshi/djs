// Builtins do only the lookups their spec steps list, so replacing the
// methods below must not change what they return.
// Node's console.log itself needs %Array.prototype%, so it gets one string.
const write = console.log
const log = (...values) => write(values.join(" "))
log("before")
Object.defineProperty(Array.prototype, "0", { set() { throw new Error("set 0") }, configurable: true })
Object.defineProperty(Array.prototype, "1", { set() { throw new Error("set 1") }, configurable: true })
Object.defineProperty(Object.prototype, "get", { value() {}, writable: true, configurable: true })
Array.prototype.push = function () { throw new Error("push") }
Array.prototype[Symbol.iterator] = function () { throw new Error("iterator") }
// Each callback has its own `call`, so a builtin using `callback.call` fails.
function guarded(callback) {
  callback.call = function () { throw new Error("call") }
  return callback
}

log("abcabc".replace(/b(c)/g, guarded((match, group, index) => `[${match}${group}${index}]`)))
log("a-b".replace("-", guarded((match, index) => `<${match}${index}>`)))
log("x1y2".replace(/[0-9]/g, "#"))
log([3, 1, 2].map(guarded((x) => x * 2)).join(","))
log([3, 1, 2].filter(guarded((x) => x > 1)).join(","))
log([3, 1, 2].reduce(guarded((a, b) => a + b), 0))
log([3, 1, 2].sort(guarded((a, b) => a - b)).join(","))
log([[1, [2]], 3].flat(2).join(","))
log([1].concat([2], 3).join(","))
log("a,b,c".split(",").join("|"))
log(Array.from("ab", guarded((x) => x + x)).join(","))
log(String(/x(y)/.exec("axy")), /a+/.test("caat"), String([1, 2]))
const spread = { ...{ x: 1 }, y: 2 }
log(spread.x + spread.y)
for (const key in { p: 1, q: 2 }) log(key)
log(Symbol.for("k") === Symbol.for("k"), `${{ toString: guarded(() => "s") }}`)
log(new TypeError("t").message, new RangeError("r", { cause: 1 }).cause)
try { null.x } catch (error) { log(error instanceof TypeError) }
log(await Promise.resolve(1).then(guarded((value) => value + 1)))
log(await new Promise(guarded((resolve) => resolve(5))))
async function seven() { return 7 }
log(await seven())
// Node's own job queue needs %Array.prototype% back before the program exits.
delete Array.prototype[0]
delete Array.prototype[1]
