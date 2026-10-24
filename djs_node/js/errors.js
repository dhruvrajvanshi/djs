export class Error {
  name = "Error"
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
