console.log("Error.isError(new Error()) ===", Error.isError(new Error()))
console.log(
  "Error.isError(new TypeError()) ===",
  Error.isError(new TypeError()),
)
console.log("Error.isError({}) ===", Error.isError({}))
console.log("Error.isError(null) ===", Error.isError(null))
