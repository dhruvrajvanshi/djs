import { to_string, is_object } from "./abstract.js"

export class Error {
  name = "Error"
  toString() {
    if (!is_object(this))
      throw new TypeError("Error.toString requires an object")
    const name_value = this.name
    const name = name_value === undefined ? "Error" : to_string(name_value)
    const message_value = this.message
    const message = message_value === undefined ? "" : to_string(message_value)
    if (name === "") return message
    if (message === "") return name
    return name + ": " + message
  }
  constructor(message) {
    this.message = message === undefined ? "" : message
  }
}
export class TypeError {
  name = "TypeError"
  constructor(message) {
    this.message = message === undefined ? "" : message
  }
}
export class RangeError {
  name = "RangeError"
  constructor(message) {
    this.message = message === undefined ? "" : message
  }
}
export class ReferenceError {
  name = "ReferenceError"
  constructor(message) {
    this.message = message === undefined ? "" : message
  }
}
export class SyntaxError {
  name = "SyntaxError"
  constructor(message) {
    this.message = message === undefined ? "" : message
  }
}
