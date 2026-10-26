import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import {
  TAGS,
  kind_of,
  read_number,
  set_ref,
  tag_of,
  write_boolean,
  write_null,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import { NATIVE_MARKERS } from "../../compiler/bytecode.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import { enqueue_job, start_operation } from "../../runtime/scheduler.ts"
import {
  read_string,
  slice_string,
  string_code_unit_at,
  string_length,
  write_string,
} from "../records/string.ts"
import { create_symbol, load_symbol_description } from "../records/symbol.ts"
import { byte_buffer_view, create_byte_buffer } from "../records/byte_buffer.ts"
import {
  has_property_list,
  is_object,
  object_prototype_reference,
  set_prototype,
  try_set_prototype,
} from "../records/object.ts"
import {
  BUILTIN_CONSTRUCTOR,
  function_code_id,
  function_flags,
  set_builtin_steps,
} from "../records/function.ts"
import {
  create_array,
  create_function,
  create_object,
  create_string_object,
} from "../semantics/objects.ts"
import {
  define_own_property,
  define_property,
  delete_property,
  get_own_property_descriptor,
  get_property,
  has_properties,
  has_property,
  ordinary_own_property_keys,
} from "../semantics/properties.ts"
import { has_slot, get_slot, set_slot, init_slot } from "../semantics/slots.ts"
import { OK, THROW, throw_error, clear_exception } from "../semantics/errors.ts"
import type { Status } from "../semantics/errors.ts"

export const NATIVE_CODE = 0xffffffff
/** Built-in function objects run the steps stored by set_builtin_steps. */
export const BUILTIN_CODE = 0xfffffffd
export const RESUME_CODE = 0xfffffffe
// Returns -1 after raising, since valid arguments are never negative.
function integer(
  runtime: Runtime,
  value: Root,
  name: string,
  maximum: number = Number.MAX_SAFE_INTEGER,
) {
  const { memory } = runtime
  if (value === undefined) {
    throw_error(runtime, "TypeError", `${name} is required`)
    return -1
  }
  if (tag_of(memory, value) !== TAGS.NUMBER) {
    throw_error(runtime, "TypeError", "Expected a numeric value")
    return -1
  }
  const number = read_number(memory, value)
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
    throw_error(runtime, "RangeError", `Invalid ${name}`)
    return -1
  }
  return number
}

// Returns undefined after raising.
function string(runtime: Runtime, value: Root, name: string) {
  if (value === undefined || kind_of(runtime.memory, value) !== KINDS.STRING) {
    throw_error(runtime, "TypeError", `${name} must be a string`)
    return undefined
  }
  return read_string(runtime.memory, value)
}

function is_string(memory: Memory, value: Root) {
  return value !== undefined && kind_of(memory, value) === KINDS.STRING
}

// An omitted prototype argument selects the default.
function is_prototype(memory: Memory, value: Root | undefined) {
  return (
    value === undefined ||
    tag_of(memory, value) === TAGS.NULL ||
    has_property_list(memory, value)
  )
}

function check_callbacks(runtime: Runtime, resolve: Root, reject: Root) {
  const { memory } = runtime
  if (
    resolve === undefined ||
    reject === undefined ||
    kind_of(memory, resolve) !== KINDS.FUNCTION ||
    kind_of(memory, reject) !== KINDS.FUNCTION
  )
    return throw_error(
      runtime,
      "TypeError",
      "I/O operation requires resolve and reject callbacks",
    )
  return OK
}

type Intrinsic = (
  runtime: Runtime,
  destination: Root,
  arguments_: Root[],
) => Status

const INTRINSICS: Record<string, Intrinsic> = {
  ordinary_define_own_property(runtime, destination, arguments_) {
    const status = define_own_property(
      runtime,
      arguments_[0],
      arguments_[1],
      arguments_[2],
      true,
    )
    if (status === THROW) clear_exception(runtime)
    write_boolean(runtime.memory, destination, status === OK)
    return OK
  },
  ordinary_delete(runtime, destination, arguments_) {
    write_boolean(
      runtime.memory,
      destination,
      has_properties(runtime, arguments_[0]) &&
        delete_property(runtime, arguments_[0], arguments_[1]),
    )
    return OK
  },
  ordinary_own_property_keys(runtime, destination, arguments_) {
    if (!has_property_list(runtime.memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    ordinary_own_property_keys(runtime, destination, arguments_[0])
    return OK
  },
  symbol_create(runtime, destination, arguments_) {
    const { memory } = runtime
    const description = arguments_[0]
    if (
      description !== undefined &&
      tag_of(memory, description) !== TAGS.UNDEFINED &&
      kind_of(memory, description) !== KINDS.STRING
    )
      return throw_error(
        runtime,
        "TypeError",
        "Symbol description must be a string or undefined",
      )
    create_symbol(memory, destination, description)
    return OK
  },
  symbol_description(runtime, destination, arguments_) {
    const { memory } = runtime
    if (
      arguments_[0] === undefined ||
      kind_of(memory, arguments_[0]) !== KINDS.SYMBOL
    )
      return throw_error(runtime, "TypeError", "Expected a symbol")
    load_symbol_description(memory, destination, arguments_[0])
    return OK
  },
  well_known_symbol(runtime, destination, arguments_) {
    const name = string(runtime, arguments_[0], "Symbol name")
    if (name === undefined) return THROW
    const symbol = runtime.realm.well_known_symbols.get(name)
    if (symbol === undefined)
      return throw_error(runtime, "TypeError", "Unknown well-known symbol")
    runtime.memory.copy_value(destination, symbol)
    return OK
  },
  string_code_unit_at(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_string(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected a string")
    const index = integer(runtime, arguments_[1], "string index")
    if (index < 0) return THROW
    if (index >= string_length(memory, arguments_[0]))
      return throw_error(runtime, "RangeError", "Invalid string index")
    write_number(
      memory,
      destination,
      string_code_unit_at(memory, arguments_[0], index),
    )
    return OK
  },
  string_slice(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_string(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected a string")
    const start = integer(runtime, arguments_[1], "start")
    if (start < 0) return THROW
    const end = integer(runtime, arguments_[2], "end")
    if (end < 0) return THROW
    if (end < start || end > string_length(memory, arguments_[0]))
      return throw_error(runtime, "RangeError", "Invalid string range")
    slice_string(memory, destination, arguments_[0], start, end)
    return OK
  },
  string_create(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_string(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected a string")
    if (!is_prototype(memory, arguments_[1]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_string_object(runtime, destination, arguments_[0], arguments_[1])
    return OK
  },
  array_create(runtime, destination, arguments_) {
    const length = integer(runtime, arguments_[0], "array length", 0xffffffff)
    if (length < 0) return THROW
    if (!is_prototype(runtime.memory, arguments_[1]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_array(runtime, destination, length, arguments_[1])
    return OK
  },
  is_constructor({ memory }, destination, arguments_) {
    let result = false
    if (
      arguments_[0] !== undefined &&
      kind_of(memory, arguments_[0]) === KINDS.FUNCTION
    ) {
      const code = function_code_id(memory, arguments_[0])
      const flags = function_flags(memory, arguments_[0])
      result =
        code === BUILTIN_CODE
          ? Boolean(flags & BUILTIN_CONSTRUCTOR)
          : code !== NATIVE_CODE && code !== RESUME_CODE && !(flags & 14)
    }
    write_boolean(memory, destination, result)
    return OK
  },
  is_array({ memory }, destination, arguments_) {
    write_boolean(
      memory,
      destination,
      arguments_[0] !== undefined &&
        kind_of(memory, arguments_[0]) === KINDS.ARRAY,
    )
    return OK
  },
  has_property(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_object(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    write_boolean(
      memory,
      destination,
      has_property(runtime, arguments_[0], arguments_[1]),
    )
    return OK
  },
  delete_property_or_throw(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_object(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    if (!delete_property(runtime, arguments_[0], arguments_[1]))
      return throw_error(
        runtime,
        "TypeError",
        "Cannot delete non-configurable property",
      )
    write_boolean(memory, destination, true)
    return OK
  },
  get_own_property(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_object(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    get_own_property_descriptor(
      runtime,
      destination,
      arguments_[0],
      arguments_[1],
    )
    return OK
  },
  define_property_or_throw(runtime, destination, arguments_) {
    if (
      define_own_property(
        runtime,
        arguments_[0],
        arguments_[1],
        arguments_[2],
      ) === THROW
    )
      return THROW
    write_undefined(runtime.memory, destination)
    return OK
  },
  create_builtin_function(runtime, destination, arguments_) {
    const { memory } = runtime
    const behaviour = arguments_[0]
    if (
      behaviour === undefined ||
      kind_of(memory, behaviour) !== KINDS.FUNCTION ||
      [NATIVE_CODE, RESUME_CODE, BUILTIN_CODE].includes(
        function_code_id(memory, behaviour),
      )
    )
      return throw_error(runtime, "TypeError", "Expected a JavaScript function")
    const length = integer(runtime, arguments_[1], "length")
    if (length < 0) return THROW
    const name = string(runtime, arguments_[2], "name")
    if (name === undefined) return THROW
    const result = memory.alloc_root(),
      key = memory.alloc_root(),
      value = memory.alloc_root()
    try {
      create_function(runtime, result, BUILTIN_CODE, 0)
      set_builtin_steps(memory, result, behaviour, false)
      write_string(memory, key, "length")
      write_number(memory, value, length)
      define_property(runtime, result, key, value, 4)
      write_string(memory, key, "name")
      write_string(memory, value, name)
      define_property(runtime, result, key, value, 4)
      memory.copy_value(destination, result)
      return OK
    } finally {
      for (const root of [result, key, value]) memory.free_root(root)
    }
  },
  ordinary_object_create(runtime, destination, arguments_) {
    const { memory } = runtime
    if (arguments_[0] === undefined || !is_prototype(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    const object = memory.alloc_root(),
      key = memory.alloc_root(),
      name = memory.alloc_root(),
      empty = memory.alloc_root()
    try {
      create_object(runtime, object)
      set_prototype(memory, object, arguments_[0])
      const names = arguments_[1]
      if (names !== undefined && tag_of(memory, names) !== TAGS.UNDEFINED) {
        if (kind_of(memory, names) !== KINDS.ARRAY)
          return throw_error(runtime, "TypeError", "Expected slot names")
        write_string(memory, key, "length")
        get_property(runtime, name, names, key)
        const count = read_number(memory, name)
        for (let index = 0; index < count; index++) {
          write_string(memory, key, String(index))
          get_property(runtime, name, names, key)
          if (!is_string(memory, name))
            return throw_error(runtime, "TypeError", "Expected a slot name")
          if (
            init_slot(runtime, object, read_string(memory, name), empty) ===
            THROW
          )
            return THROW
        }
      }
      memory.copy_value(destination, object)
      return OK
    } finally {
      for (const root of [object, key, name, empty]) memory.free_root(root)
    }
  },
  ordinary_set_prototype_of(runtime, destination, arguments_) {
    const { memory } = runtime
    if (
      !has_property_list(memory, arguments_[0]) ||
      arguments_[1] === undefined ||
      !is_prototype(memory, arguments_[1])
    )
      return throw_error(runtime, "TypeError", "Expected an object")
    write_boolean(
      memory,
      destination,
      try_set_prototype(memory, arguments_[0], arguments_[1]),
    )
    return OK
  },
  has_slot(runtime, destination, arguments_) {
    const name = string(runtime, arguments_[1], "Slot name")
    if (name === undefined) return THROW
    write_boolean(
      runtime.memory,
      destination,
      arguments_[0] !== undefined && has_slot(runtime, arguments_[0], name),
    )
    return OK
  },
  get_slot(runtime, destination, arguments_) {
    const name = string(runtime, arguments_[1], "Slot name")
    if (name === undefined) return THROW
    if (arguments_[0] === undefined)
      return throw_error(runtime, "TypeError", "Expected an object")
    return get_slot(runtime, destination, arguments_[0], name)
  },
  set_slot(runtime, destination, arguments_) {
    const name = string(runtime, arguments_[1], "Slot name")
    if (name === undefined) return THROW
    if (arguments_[0] === undefined || arguments_[2] === undefined)
      return throw_error(runtime, "TypeError", "Expected an object and value")
    if (set_slot(runtime, arguments_[0], name, arguments_[2]) === THROW)
      return THROW
    write_undefined(runtime.memory, destination)
    return OK
  },
  ordinary_get_prototype_of(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!has_property_list(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an ordinary object")
    const prototype = object_prototype_reference(memory, arguments_[0])
    if (prototype) set_ref(memory, destination, prototype)
    else write_null(memory, destination)
    return OK
  },
  write_stdout(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_string(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "write_stdout requires a string")
    runtime.host.write_stdout(read_string(memory, arguments_[0]))
    write_undefined(memory, destination)
    return OK
  },
  process_cwd(runtime, destination) {
    write_string(runtime.memory, destination, runtime.host.cwd())
    return OK
  },
  host_enqueue_promise_job(runtime, destination, arguments_) {
    if (
      arguments_[0] === undefined ||
      kind_of(runtime.memory, arguments_[0]) !== KINDS.FUNCTION
    )
      return throw_error(runtime, "TypeError", "Job is not callable")
    enqueue_job(runtime, arguments_[0])
    write_undefined(runtime.memory, destination)
    return OK
  },
  byte_buffer(runtime, destination, arguments_) {
    const length = integer(runtime, arguments_[0], "byte buffer length")
    if (length < 0) return THROW
    if (length > 0x7ffffff0)
      return throw_error(runtime, "RangeError", "Invalid byte buffer length")
    create_byte_buffer(runtime.memory, destination, length)
    return OK
  },
  string_from_code_unit(runtime, destination, arguments_) {
    const code_unit = integer(runtime, arguments_[0], "code unit", 0xffff)
    if (code_unit < 0) return THROW
    write_string(runtime.memory, destination, String.fromCharCode(code_unit))
    return OK
  },
  io_open(runtime, destination, arguments_) {
    const path = string(runtime, arguments_[0], "path")
    if (path === undefined) return THROW
    const flags = string(runtime, arguments_[1], "flags")
    if (flags === undefined) return THROW
    const mode = integer(runtime, arguments_[2], "mode", 0o7777)
    if (mode < 0) return THROW
    if (check_callbacks(runtime, arguments_[3], arguments_[4]) === THROW)
      return THROW
    start_operation(
      runtime,
      arguments_[3],
      arguments_[4],
      () => runtime.host.open(path, flags, mode),
      { syscall: "open", path },
    )
    write_undefined(runtime.memory, destination)
    return OK
  },
  io_read(runtime, destination, arguments_) {
    const { memory } = runtime
    const handle = integer(runtime, arguments_[0], "file handle")
    if (handle < 0) return THROW
    const buffer = arguments_[1]
    const offset = integer(runtime, arguments_[2], "buffer offset", 0xffffffff)
    if (offset < 0) return THROW
    const length = integer(runtime, arguments_[3], "read length", 0xffffffff)
    if (length < 0) return THROW
    if (buffer === undefined || kind_of(memory, buffer) !== KINDS.BYTE_BUFFER)
      return throw_error(runtime, "TypeError", "Expected a byte buffer")
    const capacity = byte_buffer_view(memory, buffer).length
    if (offset > capacity || length > capacity - offset)
      return throw_error(
        runtime,
        "RangeError",
        "Read exceeds byte buffer bounds",
      )
    if (check_callbacks(runtime, arguments_[4], arguments_[5]) === THROW)
      return THROW
    start_operation(
      runtime,
      arguments_[4],
      arguments_[5],
      () => runtime.host.read(handle, length),
      { buffer, offset, length, syscall: "read" },
    )
    write_undefined(memory, destination)
    return OK
  },
  io_close(runtime, destination, arguments_) {
    const handle = integer(runtime, arguments_[0], "file handle")
    if (handle < 0) return THROW
    if (check_callbacks(runtime, arguments_[1], arguments_[2]) === THROW)
      return THROW
    start_operation(
      runtime,
      arguments_[1],
      arguments_[2],
      () => runtime.host.close(handle),
      { syscall: "close" },
    )
    write_undefined(runtime.memory, destination)
    return OK
  },
  call() {
    panic("call is handled by the interpreter")
  },
  ...Object.fromEntries(
    NATIVE_MARKERS.map((name) => [
      name,
      (runtime: Runtime) =>
        throw_error(
          runtime,
          "TypeError",
          `${name} declares the realm and is never evaluated`,
        ),
    ]),
  ),
}

const INTRINSIC_HANDLERS = Object.freeze(Object.values(INTRINSICS))
const INTRINSIC_NAMES = Object.freeze(Object.keys(INTRINSICS))
const HOST_NAMES = Object.freeze([
  "write_stdout",
  "process_cwd",
  "io_open",
  "io_read",
  "io_close",
])

function native_module(names: readonly string[]) {
  return new Map(names.map((name) => [name, intrinsic_id(name)]))
}

/** Exported names and intrinsic IDs of each native module. */
export const NATIVE_MODULES: ReadonlyMap<string, Map<string, number>> = new Map(
  [
    [
      "djs:native",
      native_module(
        INTRINSIC_NAMES.filter((name) => !HOST_NAMES.includes(name)),
      ),
    ],
    ["djs:host", native_module(HOST_NAMES)],
  ],
)

export function intrinsic_id(name: string) {
  const id = INTRINSIC_NAMES.indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown intrinsic: ${name}`)
  return id
}

export const CALL_ID = intrinsic_id("call")

export function call_intrinsic(
  runtime: Runtime,
  id: number,
  destination: Root,
  arguments_: Root[],
): Status {
  const intrinsic = INTRINSIC_HANDLERS[id]
  if (intrinsic === undefined) panic(`Invalid intrinsic ID: ${id}`)
  return intrinsic(runtime, destination, arguments_)
}
