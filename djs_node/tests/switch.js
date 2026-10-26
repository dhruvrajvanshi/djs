function describe(value) {
  switch (value) {
    case 1:
      return "one"
    case "1":
    case 2: {
      const label = "string one or two"
      return label
    }
    default:
      return "other"
    case 3:
      return "three"
  }
}
console.log(describe(1), describe("1"), describe(2), describe(3), describe(4))
let log = ""
for (let i = 0; i < 4; i++) {
  switch (i) {
    case 0:
      log += "a"
    case 1:
      log += "b"
      break
    case 2:
      continue
    default:
      log += "d"
  }
  log += i
}
console.log(log)
switch (0) {
  case 0:
    let scoped = "scoped"
    console.log(scoped, hoisted())
    function hoisted() {
      return "hoisted"
    }
}
