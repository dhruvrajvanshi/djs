import path, { isAbsolute, join, resolve } from "node:path"

console.log(
  isAbsolute("/a"),
  isAbsolute("a"),
  isAbsolute(""),
  isAbsolute("./a"),
)
console.log(join())
console.log(join(""))
console.log(join("a", "b", "c"))
console.log(join("/a/", "/b/", "c/"))
console.log(join("a", "..", ".."))
console.log(join("/a", "..", ".."))
console.log(join("a/./b", "../c"))
console.log(join("./", ""))
console.log(join("a", ""))
console.log(join("//a//b//"))
console.log(resolve("/a/b", "c"))
console.log(resolve("/a/b", "/c", "d/"))
console.log(resolve("/a", "../../.."))
console.log(resolve("/"))
console.log(resolve() === resolve("."))
console.log(resolve("x").endsWith("/tests/x"))
console.log(isAbsolute(resolve("x")))
console.log(path.join === join)
try {
  join("a", 1)
} catch (error) {
  console.log(error instanceof TypeError)
}
