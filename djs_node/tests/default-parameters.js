function greet(name = "world", punctuation = "!") {
  return "hello " + name + punctuation
}
console.log(greet())
console.log(greet("djs"))
console.log(greet(undefined, "?"))
console.log(greet(null))

let calls = 0
function count(value = (calls = calls + 1)) {
  return value
}
count(5)
count()
console.log(calls)

const add = (a, b = a + 1) => a + b
console.log(add(1))
console.log(add(1, 1))
