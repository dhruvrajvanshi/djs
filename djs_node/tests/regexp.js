console.log(
  /[0-9]/.test("a1"),
  /[0-9]/.test("ab"),
  /^[A-Za-z_$][\w$]*$/.test("_a1"),
  /^\d+$/.test("12a"),
)
console.log("`foo ${".replace(/^[`}]/, "").replace(/(\$\{|`)$/, ""))
console.log("a\r\nb\rc".replace(/\r\n?/g, "\n") === "a\nb\nc")
const m = /(\w+)@(\w+)\.com/.exec("mail bob@example.com now")
console.log(m[0], m[1], m[2], m.index, m.length)
console.log("John Smith".replace(/(\w+)\s(\w+)/, "$2, $1"))
console.log("aaa".replace(/a/g, (x, i) => x + i))
console.log("x-y_z".replaceAll(/[-_]/g, "."))
const g = /o/g
console.log(
  g.exec("foo").index,
  g.lastIndex,
  g.exec("foo").index,
  g.exec("foo"),
)
console.log(
  /a.c/s.test("a\nc"),
  /a.c/.test("a\nc"),
  /ABC/i.test("xabcx"),
  /^b/m.test("a\nb"),
)
console.log(
  /(?:ab)+?c|(x)/.exec("ababc")[0],
  /a(?=b)/.exec("ab")[0],
  /a(?!b)/.test("ab"),
  /(a)\1/.test("aa"),
)
console.log(
  /a{2,3}/.exec("aaaa")[0],
  /\bfoo\b/.test("a foo b"),
  /[^abc]/.exec("abcd")[0],
)
console.log(
  String(/a\/b/gi),
  /x/y.sticky,
  new RegExp("a+", "g").source,
  RegExp("").source,
)
try {
  new RegExp("(")
} catch (error) {
  console.log(error instanceof SyntaxError)
}
