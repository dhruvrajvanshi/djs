const a = [1, 2]
const iterable = {
  [Symbol.iterator]() {
    let n = 2
    return {
      next: () => (n++ < 4 ? { value: n, done: false } : { done: true }),
    }
  },
}
const b = [0, ...a, ...iterable, ..."ab", 5]
console.log(b.join(","), b.length)
const c = [...a, , 3]
console.log(c.length, 2 in c)
console.log([...[]].length)
