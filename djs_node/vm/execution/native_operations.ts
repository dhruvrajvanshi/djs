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
import { INSTRUCTION_BYTES, NATIVE_MARKERS } from "../../compiler/bytecode.ts"
import type { CompiledModule } from "../../compiler/compile.ts"
import type { Frame } from "./fiber.ts"
import { fileURLToPath } from "node:url"
import type { Runtime } from "../../runtime/runtime.ts"
import type { HostError } from "../../host/node.ts"
import {
  enqueue_job,
  operation_error,
  start_operation,
  write_host_value,
} from "../../runtime/scheduler.ts"
import type { OperationOptions } from "../../runtime/scheduler.ts"
import {
  read_string,
  slice_string,
  string_from_utf16,
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
import {
  OK,
  THROW,
  throw_error,
  throw_value,
  clear_exception,
} from "../semantics/errors.ts"
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

/** Runs synchronously when both callbacks are omitted, otherwise settles them later. */
function host_operation(
  runtime: Runtime,
  destination: Root,
  resolve: Root,
  reject: Root,
  run_sync: () => unknown,
  run_async: () => Promise<unknown>,
  options: OperationOptions,
): Status {
  if (resolve === undefined && reject === undefined) {
    let result
    try {
      result = run_sync()
    } catch (error) {
      operation_error(
        runtime,
        destination,
        error as HostError,
        options.syscall,
        options.path,
      )
      return throw_value(runtime, destination)
    }
    write_host_value(runtime, destination, result)
    return OK
  }
  if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
  start_operation(runtime, resolve, reject, run_async, options)
  write_undefined(runtime.memory, destination)
  return OK
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

/**
 * A function exported by `djs:native` or `djs:host`. Writes its result to
 * `destination`, or raises and returns `THROW`.
 */
type NativeOperation = (
  runtime: Runtime,
  destination: Root,
  arguments_: Root[],
) => Status

/** Keyed by exported name. A name's position here is its operation ID. */
const NATIVE_OPERATIONS: Record<string, NativeOperation> = {
  /**
   * Defines `key` on `o` from the descriptor `desc`, bypassing `o`'s exotic
   * behavior. Returns `false` if the definition is refused.
   * @see https://tc39.es/ecma262/#sec-ordinarydefineownproperty
   */
  ordinary_define_own_property(runtime, destination, [o, key, desc]) {
    const status = define_own_property(runtime, o, key, desc, true)
    if (status === THROW) clear_exception(runtime)
    write_boolean(runtime.memory, destination, status === OK)
    return OK
  },
  /**
   * Deletes `key` from `o`, bypassing `o`'s exotic behavior. Returns `false` if
   * the property is non-configurable.
   * @see https://tc39.es/ecma262/#sec-ordinarydelete
   */
  ordinary_delete(runtime, destination, [o, key]) {
    write_boolean(
      runtime.memory,
      destination,
      has_properties(runtime, o) && delete_property(runtime, o, key),
    )
    return OK
  },
  /**
   * Returns an array of `o`'s own keys in spec order, bypassing `o`'s exotic
   * behavior.
   * @see https://tc39.es/ecma262/#sec-ordinaryownpropertykeys
   */
  ordinary_own_property_keys(runtime, destination, [o]) {
    if (!has_property_list(runtime.memory, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    ordinary_own_property_keys(runtime, destination, o)
    return OK
  },
  /**
   * Creates a symbol whose description is the string `description`, or none if
   * `undefined`.
   */
  symbol_create(runtime, destination, [description]) {
    const { memory } = runtime
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
  symbol_description(runtime, destination, [symbol]) {
    const { memory } = runtime
    if (symbol === undefined || kind_of(memory, symbol) !== KINDS.SYMBOL)
      return throw_error(runtime, "TypeError", "Expected a symbol")
    load_symbol_description(memory, destination, symbol)
    return OK
  },
  /**
   * Returns the realm's well-known symbol called `name`, such as `"iterator"`
   * for `Symbol.iterator`.
   * @see https://tc39.es/ecma262/#sec-well-known-symbols
   */
  well_known_symbol(runtime, destination, [name]) {
    const symbol_name = string(runtime, name, "Symbol name")
    if (symbol_name === undefined) return THROW
    const symbol = runtime.realm.well_known_symbols.get(symbol_name)
    if (symbol === undefined)
      return throw_error(runtime, "TypeError", "Unknown well-known symbol")
    runtime.memory.copy_value(destination, symbol)
    return OK
  },
  string_code_unit_at(runtime, destination, [s, index]) {
    const { memory } = runtime
    if (!is_string(memory, s))
      return throw_error(runtime, "TypeError", "Expected a string")
    const string_index = integer(runtime, index, "string index")
    if (string_index < 0) return THROW
    if (string_index >= string_length(memory, s))
      return throw_error(runtime, "RangeError", "Invalid string index")
    write_number(
      memory,
      destination,
      string_code_unit_at(memory, s, string_index),
    )
    return OK
  },
  string_slice(runtime, destination, [s, start, end]) {
    const { memory } = runtime
    if (!is_string(memory, s))
      return throw_error(runtime, "TypeError", "Expected a string")
    const start_index = integer(runtime, start, "start")
    if (start_index < 0) return THROW
    const end_index = integer(runtime, end, "end")
    if (end_index < 0) return THROW
    if (end_index < start_index || end_index > string_length(memory, s))
      return throw_error(runtime, "RangeError", "Invalid string range")
    slice_string(memory, destination, s, start_index, end_index)
    return OK
  },
  /**
   * Creates a string from code units `start` up to `end` of `buffer`, which
   * holds little-endian UTF-16. Lets JS decoders build a string in one step
   * instead of appending character by character.
   */
  string_from_utf16(runtime, destination, [buffer, start, end]) {
    const { memory } = runtime
    if (buffer === undefined || kind_of(memory, buffer) !== KINDS.BYTE_BUFFER)
      return throw_error(runtime, "TypeError", "Expected a byte buffer")
    const start_index = integer(runtime, start, "start")
    if (start_index < 0) return THROW
    const end_index = integer(runtime, end, "end")
    if (end_index < 0) return THROW
    if (
      end_index < start_index ||
      end_index * 2 > byte_buffer_view(memory, buffer).length
    )
      return throw_error(runtime, "RangeError", "Invalid code unit range")
    string_from_utf16(memory, destination, buffer, start_index, end_index)
    return OK
  },
  /**
   * Creates a String object for the string `value` whose prototype is `proto`,
   * or `%String.prototype%` if omitted.
   * @see https://tc39.es/ecma262/#sec-stringcreate
   */
  string_create(runtime, destination, [value, proto]) {
    const { memory } = runtime
    if (!is_string(memory, value))
      return throw_error(runtime, "TypeError", "Expected a string")
    if (!is_prototype(memory, proto))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_string_object(runtime, destination, value, proto)
    return OK
  },
  /**
   * Creates an empty array of the given `length` whose prototype is `proto`, or
   * `%Array.prototype%` if omitted.
   * @see https://tc39.es/ecma262/#sec-arraycreate
   */
  array_create(runtime, destination, [length, proto]) {
    const array_length = integer(runtime, length, "array length", 0xffffffff)
    if (array_length < 0) return THROW
    if (!is_prototype(runtime.memory, proto))
      return throw_error(runtime, "TypeError", "Expected an object")
    create_array(runtime, destination, array_length, proto)
    return OK
  },
  is_constructor({ memory }, destination, [f]) {
    let result = false
    if (f !== undefined && kind_of(memory, f) === KINDS.FUNCTION) {
      const code = function_code_id(memory, f)
      const flags = function_flags(memory, f)
      result =
        code === BUILTIN_CODE
          ? Boolean(flags & BUILTIN_CONSTRUCTOR)
          : code !== NATIVE_CODE && code !== RESUME_CODE && !(flags & 14)
    }
    write_boolean(memory, destination, result)
    return OK
  },
  is_array({ memory }, destination, [o]) {
    write_boolean(
      memory,
      destination,
      o !== undefined && kind_of(memory, o) === KINDS.ARRAY,
    )
    return OK
  },
  has_property(runtime, destination, [o, key]) {
    const { memory } = runtime
    if (!is_object(memory, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    write_boolean(memory, destination, has_property(runtime, o, key))
    return OK
  },
  delete_property_or_throw(runtime, destination, [o, key]) {
    const { memory } = runtime
    if (!is_object(memory, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    if (!delete_property(runtime, o, key))
      return throw_error(
        runtime,
        "TypeError",
        "Cannot delete non-configurable property",
      )
    write_boolean(memory, destination, true)
    return OK
  },
  /**
   * Returns a descriptor object for `o`'s own property `key` (`value`,
   * `writable`, `get`, `set`, `enumerable`, `configurable`), or `undefined`.
   * @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getownproperty-p
   */
  get_own_property(runtime, destination, [o, key]) {
    const { memory } = runtime
    if (!is_object(memory, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    get_own_property_descriptor(runtime, destination, o, key)
    return OK
  },
  /**
   * Defines `key` on `o` through its `[[DefineOwnProperty]]`, so exotic
   * behavior applies. Throws if the definition is refused. `desc` is a plain
   * object such as `{ value: 1, writable: true }` whose fields are data
   * properties, not getters.
   * @see https://tc39.es/ecma262/#sec-definepropertyorthrow
   */
  define_property_or_throw(runtime, destination, [o, key, desc]) {
    if (define_own_property(runtime, o, key, desc) === THROW) return THROW
    write_undefined(runtime.memory, destination)
    return OK
  },
  /**
   * Creates a built-in function with `length` and `name` that runs the JS
   * function `behaviour` when called. It can't be used with `new`.
   * @see https://tc39.es/ecma262/#sec-createbuiltinfunction
   */
  create_builtin_function(runtime, destination, [behaviour, length, name]) {
    const { memory } = runtime
    if (
      behaviour === undefined ||
      kind_of(memory, behaviour) !== KINDS.FUNCTION ||
      [NATIVE_CODE, RESUME_CODE, BUILTIN_CODE].includes(
        function_code_id(memory, behaviour),
      )
    )
      return throw_error(runtime, "TypeError", "Expected a JavaScript function")
    const function_length = integer(runtime, length, "length")
    if (function_length < 0) return THROW
    const function_name = string(runtime, name, "name")
    if (function_name === undefined) return THROW
    const result = memory.alloc_root(),
      key = memory.alloc_root(),
      value = memory.alloc_root()
    try {
      create_function(runtime, result, BUILTIN_CODE, 0)
      set_builtin_steps(memory, result, behaviour, false)
      write_string(memory, key, "length")
      write_number(memory, value, function_length)
      define_property(runtime, result, key, value, 4)
      write_string(memory, key, "name")
      write_string(memory, value, function_name)
      define_property(runtime, result, key, value, 4)
      memory.copy_value(destination, result)
      return OK
    } finally {
      for (const root of [result, key, value]) memory.free_root(root)
    }
  },
  /**
   * Creates an ordinary object whose prototype is `proto` (an object or
   * `null`), with the internal slots named in the array `slots`, such as
   * `["[[ErrorData]]"]`.
   * @see https://tc39.es/ecma262/#sec-ordinaryobjectcreate
   */
  ordinary_object_create(runtime, destination, [proto, slots]) {
    const { memory } = runtime
    if (proto === undefined || !is_prototype(memory, proto))
      return throw_error(runtime, "TypeError", "Expected an object")
    const object = memory.alloc_root(),
      key = memory.alloc_root(),
      name = memory.alloc_root(),
      empty = memory.alloc_root()
    try {
      create_object(runtime, object)
      set_prototype(memory, object, proto)
      if (slots !== undefined && tag_of(memory, slots) !== TAGS.UNDEFINED) {
        if (kind_of(memory, slots) !== KINDS.ARRAY)
          return throw_error(runtime, "TypeError", "Expected slot names")
        write_string(memory, key, "length")
        get_property(runtime, name, slots, key)
        const count = read_number(memory, name)
        for (let index = 0; index < count; index++) {
          write_string(memory, key, String(index))
          get_property(runtime, name, slots, key)
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
  /**
   * Sets `o`'s prototype to `proto`. Returns `false` if that would create a
   * cycle.
   * @see https://tc39.es/ecma262/#sec-ordinarysetprototypeof
   */
  ordinary_set_prototype_of(runtime, destination, [o, proto]) {
    const { memory } = runtime
    if (
      !has_property_list(memory, o) ||
      proto === undefined ||
      !is_prototype(memory, proto)
    )
      return throw_error(runtime, "TypeError", "Expected an object")
    write_boolean(memory, destination, try_set_prototype(memory, o, proto))
    return OK
  },
  has_slot(runtime, destination, [o, name]) {
    const slot_name = string(runtime, name, "Slot name")
    if (slot_name === undefined) return THROW
    write_boolean(
      runtime.memory,
      destination,
      o !== undefined && has_slot(runtime, o, slot_name),
    )
    return OK
  },
  get_slot(runtime, destination, [o, name]) {
    const slot_name = string(runtime, name, "Slot name")
    if (slot_name === undefined) return THROW
    if (o === undefined)
      return throw_error(runtime, "TypeError", "Expected an object")
    return get_slot(runtime, destination, o, slot_name)
  },
  /**
   * Sets `o`'s existing internal slot `name` to `value`; it can't add a slot.
   * Throws for slots the VM manages itself: `[[Prototype]]` (use
   * `ordinary_set_prototype_of`), `[[Extensible]]`, `[[StringData]]` and
   * `[[ErrorData]]`.
   */
  set_slot(runtime, destination, [o, name, value]) {
    const slot_name = string(runtime, name, "Slot name")
    if (slot_name === undefined) return THROW
    if (o === undefined || value === undefined)
      return throw_error(runtime, "TypeError", "Expected an object and value")
    if (set_slot(runtime, o, slot_name, value) === THROW) return THROW
    write_undefined(runtime.memory, destination)
    return OK
  },
  ordinary_get_prototype_of(runtime, destination, [o]) {
    const { memory } = runtime
    if (!has_property_list(memory, o))
      return throw_error(runtime, "TypeError", "Expected an ordinary object")
    const prototype = object_prototype_reference(memory, o)
    if (prototype) set_ref(memory, destination, prototype)
    else write_null(memory, destination)
    return OK
  },
  /**
   * The `    at ...` lines of the stack trace for the code that's running,
   * starting at the innermost frame outside the stdlib.
   */
  capture_stack(runtime, destination) {
    const lines = []
    for (let i = runtime.running.length - 1; i >= 0; i--) {
      for (let frame = runtime.running[i].frame; frame; frame = frame.caller) {
        const { unit } = runtime.loader.code[frame.code_id]
        if (lines.length === 0 && unit.path.startsWith(STDLIB_DIRECTORY))
          continue
        lines.push(`\n    at ${frame_location(unit, frame)}`)
      }
    }
    write_string(runtime.memory, destination, lines.join(""))
    return OK
  },
  write_stdout(runtime, destination, [text]) {
    const { memory } = runtime
    if (!is_string(memory, text))
      return throw_error(runtime, "TypeError", "write_stdout requires a string")
    runtime.host.write_stdout(read_string(memory, text))
    write_undefined(memory, destination)
    return OK
  },
  process_cwd(runtime, destination) {
    write_string(runtime.memory, destination, runtime.host.cwd())
    return OK
  },
  host_enqueue_promise_job(runtime, destination, [job]) {
    if (job === undefined || kind_of(runtime.memory, job) !== KINDS.FUNCTION)
      return throw_error(runtime, "TypeError", "Job is not callable")
    enqueue_job(runtime, job)
    write_undefined(runtime.memory, destination)
    return OK
  },
  byte_buffer(runtime, destination, [length]) {
    const byte_length = integer(runtime, length, "byte buffer length")
    if (byte_length < 0) return THROW
    if (byte_length > 0x7ffffff0)
      return throw_error(runtime, "RangeError", "Invalid byte buffer length")
    create_byte_buffer(runtime.memory, destination, byte_length)
    return OK
  },
  string_from_code_unit(runtime, destination, [unit]) {
    const code_unit = integer(runtime, unit, "code unit", 0xffff)
    if (code_unit < 0) return THROW
    write_string(runtime.memory, destination, String.fromCharCode(code_unit))
    return OK
  },
  /**
   * Opens the file at `path` with `flags` and `mode`, then calls `resolve` with
   * a numeric handle, or `reject` with an error.
   * @see https://nodejs.org/api/fs.html#fspromisesopenpath-flags-mode
   */
  io_open(runtime, destination, [path, flags, mode, resolve, reject]) {
    const file_path = string(runtime, path, "path")
    if (file_path === undefined) return THROW
    const open_flags = string(runtime, flags, "flags")
    if (open_flags === undefined) return THROW
    const file_mode = integer(runtime, mode, "mode", 0o7777)
    if (file_mode < 0) return THROW
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.open(file_path, open_flags, file_mode),
      { syscall: "open", path: file_path },
    )
    write_undefined(runtime.memory, destination)
    return OK
  },
  /**
   * Reads up to `length` bytes from the file `handle` into `buffer` at
   * `offset`, then calls `resolve` with the number of bytes read, 0 at end of
   * file.
   * @see https://nodejs.org/api/fs.html#filehandlereadbuffer-offset-length-position
   */
  io_read(
    runtime,
    destination,
    [handle, buffer, offset, length, resolve, reject],
  ) {
    const { memory } = runtime
    const file_handle = integer(runtime, handle, "file handle")
    if (file_handle < 0) return THROW
    const buffer_offset = integer(runtime, offset, "buffer offset", 0xffffffff)
    if (buffer_offset < 0) return THROW
    const read_length = integer(runtime, length, "read length", 0xffffffff)
    if (read_length < 0) return THROW
    if (buffer === undefined || kind_of(memory, buffer) !== KINDS.BYTE_BUFFER)
      return throw_error(runtime, "TypeError", "Expected a byte buffer")
    const capacity = byte_buffer_view(memory, buffer).length
    if (buffer_offset > capacity || read_length > capacity - buffer_offset)
      return throw_error(
        runtime,
        "RangeError",
        "Read exceeds byte buffer bounds",
      )
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.read(file_handle, read_length),
      {
        buffer,
        offset: buffer_offset,
        length: read_length,
        syscall: "read",
      },
    )
    write_undefined(memory, destination)
    return OK
  },
  io_close(runtime, destination, [handle, resolve, reject]) {
    const file_handle = integer(runtime, handle, "file handle")
    if (file_handle < 0) return THROW
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.close(file_handle),
      { syscall: "close" },
    )
    write_undefined(runtime.memory, destination)
    return OK
  },
  /**
   * Returns the numeric fields of Node's `Stats` for `path`, without following
   * symlinks. With `resolve` and `reject`, runs asynchronously and passes the
   * result to `resolve` instead.
   * @see https://nodejs.org/api/fs.html#fslstatsyncpath-options
   */
  io_lstat(runtime, destination, [path, resolve, reject]) {
    const file_path = string(runtime, path, "path")
    if (file_path === undefined) return THROW
    return host_operation(
      runtime,
      destination,
      resolve,
      reject,
      () => runtime.host.lstat_sync(file_path),
      () => runtime.host.lstat(file_path),
      { syscall: "lstat", path: file_path },
    )
  },
  /**
   * Returns the target of the symlink at `path`. With `resolve` and `reject`,
   * runs asynchronously and passes the result to `resolve` instead.
   * @see https://nodejs.org/api/fs.html#fsreadlinksyncpath-options
   */
  io_readlink(runtime, destination, [path, resolve, reject]) {
    const file_path = string(runtime, path, "path")
    if (file_path === undefined) return THROW
    return host_operation(
      runtime,
      destination,
      resolve,
      reject,
      () => runtime.host.readlink_sync(file_path),
      () => runtime.host.readlink(file_path),
      { syscall: "readlink", path: file_path },
    )
  },
  /**
   * Calls `f` with `this` set to `thisValue` and the remaining arguments.
   * Unlike `f.call(...)`, a program can't override it. `call_function` runs it,
   * so this entry only reserves its ID.
   * @see https://tc39.es/ecma262/#sec-call
   */
  call() {
    panic("call is handled by the interpreter")
  },
  /** Declaration markers (docs/stdlib.md). The compiler handles them. */
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

const STDLIB_DIRECTORY = fileURLToPath(
  new URL("../../stdlib/", import.meta.url),
)

function frame_location(unit: CompiledModule, frame: Frame) {
  const fn = unit.functions[frame.function_id]
  // A caller's pc is past its call instruction, so step back into it.
  const instruction = Math.max(frame.pc / INSTRUCTION_BYTES - 1, 0)
  const offset = fn.source_offsets[instruction]
  let line = 0
  while (unit.line_starts[line + 1] <= offset) line++
  const path = unit.path.startsWith(STDLIB_DIRECTORY)
    ? `djs:stdlib/${unit.path.slice(STDLIB_DIRECTORY.length)}`
    : unit.path
  const location = `${path}:${line + 1}:${offset - unit.line_starts[line] + 1}`
  if (frame.function_id === unit.entry || fn.name === "") return location
  return `${fn.name} (${location})`
}

const NATIVE_OPERATION_HANDLERS = Object.freeze(
  Object.values(NATIVE_OPERATIONS),
)
const NATIVE_OPERATION_NAMES = Object.freeze(Object.keys(NATIVE_OPERATIONS))
/** Exported by `djs:host` instead of `djs:native`. */
const HOST_NAMES = Object.freeze([
  "write_stdout",
  "process_cwd",
  "io_open",
  "io_read",
  "io_close",
  "io_lstat",
  "io_readlink",
])

function native_module(names: readonly string[]) {
  return new Map(names.map((name) => [name, native_operation_id(name)]))
}

/** Exported names and operation IDs of each native module. */
export const NATIVE_MODULES: ReadonlyMap<string, Map<string, number>> = new Map(
  [
    [
      "djs:native",
      native_module(
        NATIVE_OPERATION_NAMES.filter((name) => !HOST_NAMES.includes(name)),
      ),
    ],
    ["djs:host", native_module(HOST_NAMES)],
  ],
)

export function native_operation_id(name: string) {
  const id = NATIVE_OPERATION_NAMES.indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown native operation: ${name}`)
  return id
}

export const CALL_ID = native_operation_id("call")

export function call_native_operation(
  runtime: Runtime,
  id: number,
  destination: Root,
  arguments_: Root[],
): Status {
  const operation = NATIVE_OPERATION_HANDLERS[id]
  if (operation === undefined) panic(`Invalid native operation ID: ${id}`)
  return operation(runtime, destination, arguments_)
}
