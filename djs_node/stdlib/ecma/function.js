import { call, well_known_intrinsic_objects } from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"

const { "%Function.prototype%": function_prototype } =
  well_known_intrinsic_objects

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-function-prototype-object
 */
define_builtin_properties(function_prototype, {
  call(thisArg, ...args) {
    if (typeof this !== "function")
      throw new TypeError("Function.prototype.call called on non-function")
    return call(this, thisArg, args)
  },
})
