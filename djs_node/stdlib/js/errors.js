// 20.5 Error Objects
import {
  well_known,
  slot,
  internal_method,
  attributes,
  ordinary_object_create,
  create_builtin_function,
  capture_stack,
  has_slot,
} from "djs:native"
import {
  to_string,
  get_prototype_from_constructor,
  create_non_enumerable_data_property_or_throw,
} from "djs:abstract"
import { is_object } from "./support.js"
import { ObjectPrototype, FunctionPrototype } from "./fundamental.js"

// 20.5.1 The Error Constructor
export const Error = well_known("%Error%", create_builtin_function, {
  [slot("[[Prototype]]")]: FunctionPrototype,

  [internal_method("[[Call]]", "[[Construct]]")]: function Error(
    message,
    options = undefined,
  ) {
    return create_error(new.target ?? Error, ErrorPrototype, message, options)
  },

  prototype: attributes(
    { writable: false, configurable: false },
    ErrorPrototype,
  ),

  isError(obj) {
    return has_slot(obj, "[[ErrorData]]")
  },
})

// 20.5.3 Properties of the Error Prototype Object
const ErrorPrototype = well_known("%Error.prototype%", ordinary_object_create, {
  [slot("[[Prototype]]")]: ObjectPrototype,
  constructor: Error,
  name: "Error",
  message: "",

  // 20.5.3.4 Error.prototype.toString ( )
  toString() {
    if (!is_object(this))
      throw new TypeError("Error.prototype.toString requires an object")
    return error_to_string(this)
  },
})

function error_to_string(error) {
  const name_value = error.name
  const name = name_value === undefined ? "Error" : to_string(name_value)
  const message_value = error.message
  const message = message_value === undefined ? "" : to_string(message_value)
  if (name === "") return message
  if (message === "") return name
  return name + ": " + message
}

// 20.5.5.5 TypeError, structured as in 20.5.6.1 The NativeError Constructors
export const TypeError = well_known("%TypeError%", create_builtin_function, {
  [slot("[[Prototype]]")]: Error,

  [internal_method("[[Call]]", "[[Construct]]")]: function TypeError(
    message,
    options = undefined,
  ) {
    return create_error(
      new.target ?? TypeError,
      TypeErrorPrototype,
      message,
      options,
    )
  },

  prototype: attributes(
    { writable: false, configurable: false },
    TypeErrorPrototype,
  ),
})

// 20.5.6.3 Properties of the NativeError Prototype Objects
const TypeErrorPrototype = well_known(
  "%TypeError.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ErrorPrototype,
    constructor: TypeError,
    name: "TypeError",
    message: "",
  },
)

// 20.5.5.2 RangeError, structured as in 20.5.6.1 The NativeError Constructors
export const RangeError = well_known("%RangeError%", create_builtin_function, {
  [slot("[[Prototype]]")]: Error,

  [internal_method("[[Call]]", "[[Construct]]")]: function RangeError(
    message,
    options = undefined,
  ) {
    return create_error(
      new.target ?? RangeError,
      RangeErrorPrototype,
      message,
      options,
    )
  },

  prototype: attributes(
    { writable: false, configurable: false },
    RangeErrorPrototype,
  ),
})

// 20.5.6.3 Properties of the NativeError Prototype Objects
const RangeErrorPrototype = well_known(
  "%RangeError.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ErrorPrototype,
    constructor: RangeError,
    name: "RangeError",
    message: "",
  },
)

// 20.5.5.3 ReferenceError, structured as in 20.5.6.1 The NativeError Constructors
export const ReferenceError = well_known(
  "%ReferenceError%",
  create_builtin_function,
  {
    [slot("[[Prototype]]")]: Error,

    [internal_method("[[Call]]", "[[Construct]]")]: function ReferenceError(
      message,
      options = undefined,
    ) {
      return create_error(
        new.target ?? ReferenceError,
        ReferenceErrorPrototype,
        message,
        options,
      )
    },

    prototype: attributes(
      { writable: false, configurable: false },
      ReferenceErrorPrototype,
    ),
  },
)

// 20.5.6.3 Properties of the NativeError Prototype Objects
const ReferenceErrorPrototype = well_known(
  "%ReferenceError.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ErrorPrototype,
    constructor: ReferenceError,
    name: "ReferenceError",
    message: "",
  },
)

// 20.5.5.4 SyntaxError, structured as in 20.5.6.1 The NativeError Constructors
export const SyntaxError = well_known(
  "%SyntaxError%",
  create_builtin_function,
  {
    [slot("[[Prototype]]")]: Error,

    [internal_method("[[Call]]", "[[Construct]]")]: function SyntaxError(
      message,
      options = undefined,
    ) {
      return create_error(
        new.target ?? SyntaxError,
        SyntaxErrorPrototype,
        message,
        options,
      )
    },

    prototype: attributes(
      { writable: false, configurable: false },
      SyntaxErrorPrototype,
    ),
  },
)

// 20.5.6.3 Properties of the NativeError Prototype Objects
const SyntaxErrorPrototype = well_known(
  "%SyntaxError.prototype%",
  ordinary_object_create,
  {
    [slot("[[Prototype]]")]: ErrorPrototype,
    constructor: SyntaxError,
    name: "SyntaxError",
    message: "",
  },
)

function create_error(new_target, default_prototype, message, options) {
  const error = ordinary_object_create(
    get_prototype_from_constructor(new_target, default_prototype),
    ["[[ErrorData]]"],
  )
  if (message !== undefined)
    create_non_enumerable_data_property_or_throw(
      error,
      "message",
      to_string(message),
    )
  // 20.5.9.1 InstallErrorCause
  if (is_object(options) && "cause" in options)
    create_non_enumerable_data_property_or_throw(error, "cause", options.cause)
  create_non_enumerable_data_property_or_throw(
    error,
    "stack",
    error_to_string(error) + capture_stack(),
  )
  return error
}
