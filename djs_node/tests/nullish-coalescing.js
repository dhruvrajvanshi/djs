let calls = 0
function fallback() {
  calls = calls + 1
  return "fallback"
}
console.log(null ?? "a")
console.log(undefined ?? "b")
console.log(0 ?? fallback())
console.log("" ?? fallback())
console.log(false ?? fallback())
console.log(calls)
const obj = {}
console.log((obj ?? 1) === obj)
console.log(null ?? undefined ?? "c")
