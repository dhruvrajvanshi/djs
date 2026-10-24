const write = @djs_intrinsic("write_stdout")
const ErrorConstructor = Error
const error_prototype = ErrorConstructor.prototype

function format_value(value) {
  if (typeof value === "function") return "[Function]"
  if (value !== null && typeof value === "object") {
    if (value === error_prototype || value instanceof ErrorConstructor)
      return format_value(value.name) + ": " + format_value(value.message)
    return "[object Object]"
  }
  return "" + value
}

export function log() {
  let text = ""
  let index = 0
  while (index < arguments.length) {
    if (index !== 0) text = text + " "
    text = text + format_value(arguments[index])
    index = index + 1
  }
  write(text + "\n")
}

export default { log }
