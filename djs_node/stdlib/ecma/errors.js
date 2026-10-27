import {
  capture_stack,
  create_builtin_function,
  define_own_property,
  has_slot,
  object_create,
  ordinary_set_prototype_of,
  well_known_intrinsic_objects,
} from "djs:vm"
import { define_builtin_properties } from "./define_builtin_properties.js"
import {
  to_string,
  get_prototype_from_constructor,
  create_non_enumerable_data_property_or_throw,
} from "./abstract-operations.js"

const {
  "%Error.prototype%": error_prototype,
  "%RangeError.prototype%": range_error_prototype,
  "%ReferenceError.prototype%": reference_error_prototype,
  "%SyntaxError.prototype%": syntax_error_prototype,
  "%TypeError.prototype%": type_error_prototype,
} = well_known_intrinsic_objects

function is_object(value) {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  )
}

function define_prototype_property(constructor, prototype) {
  define_own_property(constructor, "prototype", {
    value: prototype,
    writable: false,
    enumerable: false,
    configurable: false,
  })
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-error-constructor
 */
export const Error = create_builtin_function(
  function (message, options = undefined) {
    return create_error(new.target ?? Error, error_prototype, message, options)
  },
  { name: "Error", constructor: true },
)

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-error-constructors
 */
define_prototype_property(Error, error_prototype)
define_builtin_properties(Error, {
  isError(obj) {
    return has_slot(obj, "[[ErrorData]]")
  },
})

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-properties-of-the-error-prototype-object
 */
define_builtin_properties(error_prototype, {
  constructor: Error,
  name: "Error",
  message: "",

  toString() {
    if (!is_object(this))
      throw new TypeError("Error.prototype.toString requires an object")
    return error_to_string(this)
  },
})

// Formats an error the way Error.prototype.toString does. An empty name or
// message is left out, along with the colon:
//
//   { name: "TypeError", message: "x" }  // "TypeError: x"
//   { name: "TypeError", message: "" }   // "TypeError"
//   { name: "", message: "x" }           // "x"
function error_to_string(error) {
  const name_value = error.name
  const name = name_value === undefined ? "Error" : to_string(name_value)
  const message_value = error.message
  const message = message_value === undefined ? "" : to_string(message_value)
  if (name === "") return message
  if (message === "") return name
  return name + ": " + message
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-nativeerror-object-structure
 */
function native_error(name, prototype) {
  const constructor = create_builtin_function(
    function (message, options = undefined) {
      return create_error(
        new.target ?? constructor,
        prototype,
        message,
        options,
      )
    },
    { name, constructor: true },
  )
  ordinary_set_prototype_of(constructor, Error)
  define_prototype_property(constructor, prototype)
  ordinary_set_prototype_of(prototype, error_prototype)
  define_builtin_properties(prototype, { constructor, name, message: "" })
  return constructor
}

/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-native-error-types-used-in-this-standard
 */
export const TypeError = native_error("TypeError", type_error_prototype)
export const RangeError = native_error("RangeError", range_error_prototype)
export const ReferenceError = native_error(
  "ReferenceError",
  reference_error_prototype,
)
export const SyntaxError = native_error("SyntaxError", syntax_error_prototype)

function create_error(new_target, default_prototype, message, options) {
  const error = object_create(
    get_prototype_from_constructor(new_target, default_prototype),
    "error",
  )
  if (message !== undefined)
    create_non_enumerable_data_property_or_throw(
      error,
      "message",
      to_string(message),
    )
  // https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-installerrorcause
  if (is_object(options) && "cause" in options)
    create_non_enumerable_data_property_or_throw(error, "cause", options.cause)
  create_non_enumerable_data_property_or_throw(
    error,
    "stack",
    error_to_string(error) + capture_stack(),
  )
  return error
}
