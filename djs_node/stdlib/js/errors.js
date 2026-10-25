import {
  error_create,
  set_prototype,
  object_create,
  builtin_function,
} from "djs:intrinsics"
import {
  to_string,
  get_prototype_from_constructor,
  make_constructor,
  create_non_enumerable_data_property_or_throw,
} from "djs:abstract"
import { is_object, define_methods } from "./support.js"
import { object_prototype } from "./object.js"

export function Error(message, options) {
  return create_error(new.target ?? Error, Error, message, options)
}
export function TypeError(message, options) {
  return create_error(new.target ?? TypeError, TypeError, message, options)
}
export function RangeError(message, options) {
  return create_error(new.target ?? RangeError, RangeError, message, options)
}
export function ReferenceError(message, options) {
  return create_error(
    new.target ?? ReferenceError,
    ReferenceError,
    message,
    options,
  )
}
export function SyntaxError(message, options) {
  return create_error(new.target ?? SyntaxError, SyntaxError, message, options)
}

function create_error(new_target, constructor, message, options) {
  const error = error_create(
    get_prototype_from_constructor(new_target, constructor.prototype),
  )
  if (message !== undefined)
    create_non_enumerable_data_property_or_throw(
      error,
      "message",
      to_string(message),
    )
  if (is_object(options) && "cause" in options)
    create_non_enumerable_data_property_or_throw(error, "cause", options.cause)
  return error
}

function define_error(constructor, parent) {
  builtin_function(constructor, 1)
  const prototype = object_create(
    parent === undefined ? object_prototype : parent.prototype,
  )
  if (parent !== undefined) set_prototype(constructor, parent)
  make_constructor(constructor, prototype)
  create_non_enumerable_data_property_or_throw(
    prototype,
    "name",
    constructor.name,
  )
  create_non_enumerable_data_property_or_throw(prototype, "message", "")
}

define_error(Error)
define_error(TypeError, Error)
define_error(RangeError, Error)
define_error(ReferenceError, Error)
define_error(SyntaxError, Error)

define_methods(Error.prototype, {
  toString() {
    if (!is_object(this))
      throw new TypeError("Error.prototype.toString requires an object")
    const name_value = this.name
    const name = name_value === undefined ? "Error" : to_string(name_value)
    const message_value = this.message
    const message = message_value === undefined ? "" : to_string(message_value)
    if (name === "") return message
    if (message === "") return name
    return name + ": " + message
  },
})
