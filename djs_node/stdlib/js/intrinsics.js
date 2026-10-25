// The values the VM needs from the stdlib, exported under the names in
// REALM_INTRINSICS. The linker marks the bindings behind these exports, and
// the VM receives each value when its binding is initialized.
export { object_prototype as "%Object.prototype%" } from "./object.js"
export { array_prototype as "%Array.prototype%" } from "./array.js"
export { string_prototype as "%String.prototype%" } from "./string.js"
export { symbol_prototype as "%Symbol.prototype%" } from "./symbol.js"
export {
  Error as "%Error%",
  TypeError as "%TypeError%",
  RangeError as "%RangeError%",
  ReferenceError as "%ReferenceError%",
  SyntaxError as "%SyntaxError%",
} from "./errors.js"
export {
  to_primitive as ToPrimitive,
  to_string as ToString,
  to_number as ToNumber,
} from "djs:abstract"
export { array_define_own_property as ArrayDefineOwnProperty } from "./array.js"
export {
  await_promise as AwaitPromise,
  new_promise_capability as NewPromiseCapability,
} from "./promise.js"
