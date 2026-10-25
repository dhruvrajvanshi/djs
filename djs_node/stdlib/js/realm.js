// Each module registers its intrinsics with the VM while it is evaluated, so
// this import order is the realm's initialization order. Object comes first:
// objects created before %Object.prototype% exists have a null prototype.
export { default as Object } from "./object.js"
export {
  Error,
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
} from "./errors.js"
export { default as Symbol } from "./symbol.js"
export { default as String } from "./string.js"
export { default as Array } from "./array.js"
export { default as Promise } from "./promise.js"
