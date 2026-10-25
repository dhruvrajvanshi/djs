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
  ordinary_own_property_keys,
} from "./objects.ts"
import {
  get_own_property_descriptor,
  define_own_property,
} from "./properties.ts"
import { create_builtin_object } from "./builtins.ts"
import { KINDS, TAGS, read_u32, copy_value } from "./memory.ts"
import { enqueue_job, start_operation } from "../runtime/jobs.ts"

export const NATIVE_CODE = 0xffffffff
export const RESUME_CODE = 0xfffffffe
export const INTRINSIC_NAMES = Object.freeze([
  "write_stdout",
  "io_open",
  "io_read",
  "io_close",
  "byte_buffer",
  "string_from_code_unit",
  "enqueue_job",
  "call",
  "string_code_unit_at",
  "string_slice",
  "string_box",
  "string_value",
  "array_create",
  "is_array",
  "is_constructor",
  "has_property",
  "delete_property",
  "get_own_property_descriptor",
  "define_property",
  "object_create",
  "get_prototype",
  "set_prototype",
  "ordinary_define_own_property",
  "ordinary_own_property_keys",
  "ordinary_delete",
  "builtin_object_create",
  "symbol_create",
  "symbol_description",
  "well_known_symbol",
])

export function intrinsic_id(name: string) {
  const id = INTRINSIC_NAMES.indexOf(name)
  if (id === -1) throw new SyntaxError(`Unknown intrinsic: ${name}`)
  return id
}

function integer(
  memory: Memory,
  value: Root,
  name: string,
  maximum: number = Number.MAX_SAFE_INTEGER,
) {
  if (value === undefined) throw new TypeError(`${name} is required`)
  const number = read_number(memory, value)
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum)
    throw new RangeError(`Invalid ${name}`)
  return number
}

function string(memory: Memory, value: Root, name: string) {
  if (value === undefined || kind_of(memory, value) !== KINDS.STRING)
    throw new TypeError(`${name} must be a string`)
  return read_string(memory, value)
}

export function call_intrinsic(
  runtime: Runtime,
  id: number,
  destination: Root,
  arguments_: Root[],
) {
  const { memory } = runtime
  const name = INTRINSIC_NAMES[id]
  if (name === "ordinary_define_own_property") {
    try {
      define_own_property(
        memory,
        arguments_[0],
        arguments_[1],
        arguments_[2],
        runtime,
        true,
      )
      write_boolean(memory, destination, true)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      write_boolean(memory, destination, false)
    }
    return
  } else if (name === "ordinary_delete") {
    try {
      delete_property(memory, arguments_[0], arguments_[1])
      write_boolean(memory, destination, true)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      write_boolean(memory, destination, false)
    }
    return
  } else if (name === "ordinary_own_property_keys") {
    ordinary_own_property_keys(memory, destination, arguments_[0])
    return
  } else if (name === "builtin_object_create") {
    create_builtin_object(memory, destination, arguments_[0], arguments_[1])
    return
  } else if (name === "symbol_create") {
    const description = arguments_[0]
    if (
      description !== undefined &&
      tag_of(memory, description) !== TAGS.UNDEFINED &&
      kind_of(memory, description) !== KINDS.STRING
    )
      throw new TypeError("Symbol description must be a string or undefined")
    create_symbol(memory, destination, description)
    return
  } else if (name === "symbol_description") {
    if (
      arguments_[0] === undefined ||
      kind_of(memory, arguments_[0]) !== KINDS.SYMBOL
    )
      throw new TypeError("Expected a symbol")
    load_symbol_description(memory, destination, arguments_[0])
    return
  } else if (name === "well_known_symbol") {
    const symbol = runtime.well_known_symbols?.get(
      string(memory, arguments_[0], "Symbol name"),
    )
    if (symbol === undefined) throw new TypeError("Unknown well-known symbol")
    copy_value(memory, destination, symbol)
    return
  } else if (name === "string_code_unit_at") {
    write_number(
      memory,
      destination,
      string_code_unit_at(
        memory,
        arguments_[0],
        integer(memory, arguments_[1], "string index"),
      ),
    )
    return
  } else if (name === "string_slice") {
    slice_string(
      memory,
      destination,
      arguments_[0],
      integer(memory, arguments_[1], "start"),
      integer(memory, arguments_[2], "end"),
    )
    return
  } else if (name === "string_box") {
    create_string_object(memory, destination, arguments_[0], arguments_[1])
    return
  } else if (name === "string_value") {
    string_value(memory, destination, arguments_[0])
    return
  } else if (name === "array_create") {
    create_array(
      memory,
      destination,
      integer(memory, arguments_[0], "array length", 0xffffffff),
      arguments_[1],
    )
    return
  } else if (name === "is_constructor") {
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
    return
  } else if (name === "is_array") {
    write_boolean(
      memory,
      destination,
      arguments_[0] !== undefined &&
        kind_of(memory, arguments_[0]) === KINDS.ARRAY,
    )
    return
  } else if (name === "has_property" || name === "delete_property") {
    if (!is_object(memory, arguments_[0]))
      throw new TypeError("Expected an object")
    write_boolean(
      memory,
      destination,
      name === "has_property"
        ? has_property(memory, arguments_[0], arguments_[1])
        : delete_property(memory, arguments_[0], arguments_[1]),
    )
    return
  } else if (name === "get_own_property_descriptor") {
    if (!is_object(memory, arguments_[0]))
      throw new TypeError("Expected an object")
    get_own_property_descriptor(
      memory,
      destination,
      arguments_[0],
      arguments_[1],
    )
    return
  } else if (name === "define_property") {
    define_own_property(
      memory,
      arguments_[0],
      arguments_[1],
      arguments_[2],
      runtime,
    )
  } else if (name === "object_create") {
    create_object(memory, destination)
    set_prototype(memory, destination, arguments_[0])
    return
  } else if (name === "set_prototype") {
    set_prototype(memory, arguments_[0], arguments_[1])
  } else if (name === "get_prototype") {
    if (
      !is_object(memory, arguments_[0]) ||
      kind_of(memory, arguments_[0]) === KINDS.BYTE_BUFFER
    )
      throw new TypeError("Expected an ordinary object")
    const reference = get_ref(memory, arguments_[0])
    const prototype = read_u32(
      memory,
      reference + (kind_of(memory, arguments_[0]) === KINDS.FUNCTION ? 28 : 12),
    )
    if (prototype) set_ref(memory, destination, prototype)
    else write_null(memory, destination)
    return
  } else if (name === "write_stdout") {
    if (!arguments_.length || kind_of(memory, arguments_[0]) !== KINDS.STRING)
      throw new TypeError("write_stdout requires a string")
    runtime.host.write_stdout(read_string(memory, arguments_[0]))
  } else if (name === "enqueue_job") {
    enqueue_job(runtime, arguments_[0])
  } else if (name === "byte_buffer") {
    create_byte_buffer(
      memory,
      destination,
      integer(memory, arguments_[0], "byte buffer length"),
    )
    return
  } else if (name === "string_from_code_unit") {
    write_string(
      memory,
      destination,
      String.fromCharCode(integer(memory, arguments_[0], "code unit", 0xffff)),
    )
    return
  } else if (name === "io_open") {
    const path = string(memory, arguments_[0], "path"),
      flags = string(memory, arguments_[1], "flags"),
      mode = integer(memory, arguments_[2], "mode", 0o7777)
    start_operation(
      runtime,
      arguments_[3],
      arguments_[4],
      () => runtime.host.open(path, flags, mode),
      { syscall: "open", path },
    )
  } else if (name === "io_read") {
    const handle = integer(memory, arguments_[0], "file handle"),
      buffer = arguments_[1],
      offset = integer(memory, arguments_[2], "buffer offset", 0xffffffff),
      length = integer(memory, arguments_[3], "read length", 0xffffffff)
    if (buffer === undefined) throw new TypeError("Expected a byte buffer")
    const capacity = byte_buffer_view(memory, buffer).length
    if (offset > capacity || length > capacity - offset)
      throw new RangeError("Read exceeds byte buffer bounds")
    start_operation(
      runtime,
      arguments_[4],
      arguments_[5],
      () => runtime.host.read(handle, length),
      { buffer, offset, length, syscall: "read" },
    )
  } else if (name === "io_close") {
    const handle = integer(memory, arguments_[0], "file handle")
    start_operation(
      runtime,
      arguments_[1],
      arguments_[2],
      () => runtime.host.close(handle),
      { syscall: "close" },
    )
  } else throw new Error(`Invalid intrinsic ID: ${id}`)
  write_undefined(memory, destination)
}
