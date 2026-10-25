import type { Root, Memory } from "./memory.ts"
import type { Runtime } from "../runtime/modules.ts"
import {
  read_number,
  read_string,
  write_string,
  write_undefined,
  write_number,
  write_boolean,
  write_null,
  set_ref,
  get_ref,
  tag_of,
  string_code_unit_at,
  slice_string,
  string_length,
  create_symbol,
  load_symbol_description,
} from "./values.ts"
import { byte_buffer_view, create_byte_buffer } from "./bytes.ts"
import {
  kind_of,
  create_array,
  create_string_object,
  string_value,
  create_object,
  set_prototype,
  has_property,
  delete_property,
  is_object,
  has_properties,
  has_property_list,
  try_set_prototype,
  ordinary_own_property_keys,
  define_property,
  function_code_id,
  function_flags,
  set_function_flags,
  BUILTIN_FUNCTION,
  mark_error_object,
} from "./objects.ts"
import {
  get_own_property_descriptor,
  define_own_property,
} from "./properties.ts"
import {
  KINDS,
  TAGS,
  read_u32,
  copy_value,
  alloc_root,
  free_root,
} from "./memory.ts"
import { enqueue_job, start_operation } from "../runtime/jobs.ts"
import { panic } from "../utils.ts"
import { OK, THROW, throw_error, clear_exception } from "./completion.ts"
import type { Status } from "./completion.ts"

// Values the stdlib provides to the VM as exports of stdlib/js/intrinsics.js.
// Names in %percent% signs are the spec's well-known intrinsics; the others
// are abstract operations.
export const REALM_INTRINSICS: readonly string[] = Object.freeze([
  "%Object.prototype%",
  "%Array.prototype%",
  "%String.prototype%",
  "%Symbol.prototype%",
  "%Error%",
  "%TypeError%",
  "%RangeError%",
  "%ReferenceError%",
  "%SyntaxError%",
  "ToPrimitive",
  "ToString",
  "ToNumber",
  "ArrayDefineOwnProperty",
  "AwaitPromise",
  "NewPromiseCapability",
])

const PROTOTYPE_FIELDS = Object.freeze({
  "%Object.prototype%": "object_prototype",
  "%Array.prototype%": "array_prototype",
  "%String.prototype%": "string_prototype",
  "%Symbol.prototype%": "symbol_prototype",
} as const)

export function set_realm_intrinsic(
  runtime: Runtime,
  name: string,
  value: Root,
) {
  const root = alloc_root(runtime.memory)
  copy_value(runtime.memory, root, value)
  runtime.intrinsics.set(name, root)
  const field = PROTOTYPE_FIELDS[name as keyof typeof PROTOTYPE_FIELDS]
  if (field) runtime.memory[field] = root
}

export const NATIVE_CODE = 0xffffffff
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
  ordinary_delete({ memory }, destination, arguments_) {
    write_boolean(
      memory,
      destination,
      has_properties(memory, arguments_[0]) &&
        delete_property(memory, arguments_[0], arguments_[1]),
    )
    return OK
  },
  ordinary_own_property_keys(runtime, destination, arguments_) {
    if (!has_property_list(runtime.memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    ordinary_own_property_keys(runtime.memory, destination, arguments_[0])
    return OK
  },
  builtin_function(runtime, destination, arguments_) {
    const { memory } = runtime
    const fn = arguments_[0]
    if (
      fn === undefined ||
      kind_of(memory, fn) !== KINDS.FUNCTION ||
      function_code_id(memory, fn) === NATIVE_CODE ||
      function_code_id(memory, fn) === RESUME_CODE ||
      function_flags(memory, fn) & 15
    )
      return throw_error(runtime, "TypeError", "Expected an ordinary function")
    set_function_flags(
      memory,
      fn,
      function_flags(memory, fn) | BUILTIN_FUNCTION,
    )
    if (arguments_[1] !== undefined) {
      const length = integer(runtime, arguments_[1], "length")
      if (length < 0) return THROW
      const key = alloc_root(memory),
        value = alloc_root(memory)
      try {
        write_string(memory, key, "length")
        write_number(memory, value, length)
        define_property(memory, fn, key, value, 4)
      } finally {
        free_root(memory, key)
        free_root(memory, value)
      }
    }
    copy_value(memory, destination, fn)
    return OK
  },
  error_create(runtime, destination, arguments_) {
    const { memory } = runtime
    if (arguments_[0] === undefined || !is_prototype(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_object(memory, destination)
    mark_error_object(memory, destination)
    set_prototype(memory, destination, arguments_[0])
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
    const symbol = runtime.well_known_symbols?.get(name)
    if (symbol === undefined)
      return throw_error(runtime, "TypeError", "Unknown well-known symbol")
    copy_value(runtime.memory, destination, symbol)
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
  string_box(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_string(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected a string")
    if (!is_prototype(memory, arguments_[1]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_string_object(memory, destination, arguments_[0], arguments_[1])
    return OK
  },
  string_value(runtime, destination, arguments_) {
    const { memory } = runtime
    const kind =
      arguments_[0] === undefined ? 0 : kind_of(memory, arguments_[0])
    if (kind !== KINDS.STRING && kind !== KINDS.STRING_OBJECT)
      return throw_error(
        runtime,
        "TypeError",
        "Receiver is not a string or String object",
      )
    string_value(memory, destination, arguments_[0])
    return OK
  },
  array_create(runtime, destination, arguments_) {
    const length = integer(runtime, arguments_[0], "array length", 0xffffffff)
    if (length < 0) return THROW
    if (!is_prototype(runtime.memory, arguments_[1]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_array(runtime.memory, destination, length, arguments_[1])
    return OK
  },
  is_constructor({ memory }, destination, arguments_) {
    let result = false
    if (
      arguments_[0] !== undefined &&
      kind_of(memory, arguments_[0]) === KINDS.FUNCTION
    ) {
      const reference = get_ref(memory, arguments_[0])
      const code = read_u32(memory, reference + 8)
      result =
        code !== NATIVE_CODE &&
        code !== RESUME_CODE &&
        !(read_u32(memory, reference + 32) & 14)
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
      has_property(memory, arguments_[0], arguments_[1]),
    )
    return OK
  },
  delete_property(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_object(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    if (!delete_property(memory, arguments_[0], arguments_[1]))
      return throw_error(
        runtime,
        "TypeError",
        "Cannot delete non-configurable property",
      )
    write_boolean(memory, destination, true)
    return OK
  },
  get_own_property_descriptor(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!is_object(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    get_own_property_descriptor(
      memory,
      destination,
      arguments_[0],
      arguments_[1],
    )
    return OK
  },
  define_property(runtime, destination, arguments_) {
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
  object_create(runtime, destination, arguments_) {
    const { memory } = runtime
    if (arguments_[0] === undefined || !is_prototype(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_object(memory, destination)
    set_prototype(memory, destination, arguments_[0])
    return OK
  },
  set_prototype(runtime, destination, arguments_) {
    const { memory } = runtime
    if (
      !has_property_list(memory, arguments_[0]) ||
      arguments_[1] === undefined ||
      !is_prototype(memory, arguments_[1])
    )
      return throw_error(runtime, "TypeError", "Expected an object")
    if (!try_set_prototype(memory, arguments_[0], arguments_[1]))
      return throw_error(runtime, "TypeError", "Cyclic prototype")
    write_undefined(memory, destination)
    return OK
  },
  get_prototype(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!has_property_list(memory, arguments_[0]))
      return throw_error(runtime, "TypeError", "Expected an ordinary object")
    const reference = get_ref(memory, arguments_[0])
    const prototype = read_u32(
      memory,
      reference + (kind_of(memory, arguments_[0]) === KINDS.FUNCTION ? 28 : 12),
    )
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
  enqueue_job(runtime, destination, arguments_) {
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
      "djs:intrinsics",
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
