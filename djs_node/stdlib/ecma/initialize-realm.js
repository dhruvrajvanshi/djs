/**
 * The entry point of the ECMAScript standard library.
 * Many of the abstract operations that normal code relies on are implemented
 * directly in JS, so we've gotta be a bit careful about which syntax we
 * use where.
 *
 * `set_abstract_operation` and `set_internal_method` calls inside these
 * modules register core language operations which the VM uses to evaluate
 * basic language constructs.
 *
 * For example, regexp.js has a call to `set_abstract_operation("RegExpCreate")`,
 * which the VM calls when it sees regex literals.
 * This means that any code running before regexp.js has been imported will not
 * be able to use regex literals.
 */
export { Object } from "./object.js"
import "./function.js"
export {
  Error,
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
} from "./errors.js"
export { default as Symbol } from "./symbol.js"
export { default as Array } from "./array.js"
export { default as String } from "./string.js"
export { default as Promise } from "./promise.js"
export { default as RegExp } from "./regexp.js"
import "./iteration.js"
