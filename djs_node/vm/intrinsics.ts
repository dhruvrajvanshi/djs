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

type Intrinsic = (
  runtime: Runtime,
  destination: Root,
  arguments_: Root[],
) => void

const INTRINSICS: Record<string, Intrinsic> = {
  ordinary_define_own_property(runtime, destination, arguments_) {
    const { memory } = runtime
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
  },
  ordinary_delete({ memory }, destination, arguments_) {
    try {
      delete_property(memory, arguments_[0], arguments_[1])
      write_boolean(memory, destination, true)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      write_boolean(memory, destination, false)
    }
  },
  ordinary_own_property_keys({ memory }, destination, arguments_) {
    ordinary_own_property_keys(memory, destination, arguments_[0])
  },
  builtin_object_create({ memory }, destination, arguments_) {
    create_builtin_object(memory, destination, arguments_[0], arguments_[1])
  },
  symbol_create({ memory }, destination, arguments_) {
    const description = arguments_[0]
    if (
      description !== undefined &&
      tag_of(memory, description) !== TAGS.UNDEFINED &&
      kind_of(memory, description) !== KINDS.STRING
    )
      throw new TypeError("Symbol description must be a string or undefined")
    create_symbol(memory, destination, description)
  },
  symbol_description({ memory }, destination, arguments_) {
    if (
      arguments_[0] === undefined ||
      kind_of(memory, arguments_[0]) !== KINDS.SYMBOL
    )
      throw new TypeError("Expected a symbol")
    load_symbol_description(memory, destination, arguments_[0])
  },
  well_known_symbol(runtime, destination, arguments_) {
    const { memory } = runtime
    const symbol = runtime.well_known_symbols?.get(
      string(memory, arguments_[0], "Symbol name"),
    )
    if (symbol === undefined) throw new TypeError("Unknown well-known symbol")
    copy_value(memory, destination, symbol)
  },
  string_code_unit_at({ memory }, destination, arguments_) {
    write_number(
      memory,
      destination,
      string_code_unit_at(
        memory,
        arguments_[0],
        integer(memory, arguments_[1], "string index"),
      ),
    )
  },
  string_slice({ memory }, destination, arguments_) {
    slice_string(
      memory,
      destination,
      arguments_[0],
      integer(memory, arguments_[1], "start"),
      integer(memory, arguments_[2], "end"),
    )
  },
  string_box({ memory }, destination, arguments_) {
    create_string_object(memory, destination, arguments_[0], arguments_[1])
  },
  string_value({ memory }, destination, arguments_) {
    string_value(memory, destination, arguments_[0])
  },
  array_create({ memory }, destination, arguments_) {
    create_array(
      memory,
      destination,
      integer(memory, arguments_[0], "array length", 0xffffffff),
      arguments_[1],
    )
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
  },
  is_array({ memory }, destination, arguments_) {
    write_boolean(
      memory,
      destination,
      arguments_[0] !== undefined &&
        kind_of(memory, arguments_[0]) === KINDS.ARRAY,
    )
  },
  has_property({ memory }, destination, arguments_) {
    if (!is_object(memory, arguments_[0]))
      throw new TypeError("Expected an object")
    write_boolean(
      memory,
      destination,
      has_property(memory, arguments_[0], arguments_[1]),
    )
  },
  delete_property({ memory }, destination, arguments_) {
    if (!is_object(memory, arguments_[0]))
      throw new TypeError("Expected an object")
    write_boolean(
      memory,
      destination,
      delete_property(memory, arguments_[0], arguments_[1]),
    )
  },
  get_own_property_descriptor({ memory }, destination, arguments_) {
    if (!is_object(memory, arguments_[0]))
      throw new TypeError("Expected an object")
    get_own_property_descriptor(
      memory,
      destination,
      arguments_[0],
      arguments_[1],
    )
  },
  define_property(runtime, destination, arguments_) {
    const { memory } = runtime
    define_own_property(
      memory,
      arguments_[0],
      arguments_[1],
      arguments_[2],
      runtime,
    )
    write_undefined(memory, destination)
  },
  object_create({ memory }, destination, arguments_) {
    create_object(memory, destination)
    set_prototype(memory, destination, arguments_[0])
  },
  set_prototype({ memory }, destination, arguments_) {
    set_prototype(memory, arguments_[0], arguments_[1])
    write_undefined(memory, destination)
  },
  get_prototype({ memory }, destination, arguments_) {
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
  },
  write_stdout(runtime, destination, arguments_) {
    const { memory } = runtime
    if (!arguments_.length || kind_of(memory, arguments_[0]) !== KINDS.STRING)
      throw new TypeError("write_stdout requires a string")
    runtime.host.write_stdout(read_string(memory, arguments_[0]))
    write_undefined(memory, destination)
  },
  process_cwd(runtime, destination) {
    write_string(runtime.memory, destination, runtime.host.cwd())
  },
  enqueue_job(runtime, destination, arguments_) {
    enqueue_job(runtime, arguments_[0])
    write_undefined(runtime.memory, destination)
  },
  byte_buffer({ memory }, destination, arguments_) {
    create_byte_buffer(
      memory,
      destination,
      integer(memory, arguments_[0], "byte buffer length"),
    )
  },
  string_from_code_unit({ memory }, destination, arguments_) {
    write_string(
      memory,
      destination,
      String.fromCharCode(integer(memory, arguments_[0], "code unit", 0xffff)),
    )
  },
  io_open(runtime, destination, arguments_) {
    const { memory } = runtime
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
    write_undefined(memory, destination)
  },
  io_read(runtime, destination, arguments_) {
    const { memory } = runtime
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
    write_undefined(memory, destination)
  },
  io_close(runtime, destination, arguments_) {
    const { memory } = runtime
    const handle = integer(memory, arguments_[0], "file handle")
    start_operation(
      runtime,
      arguments_[1],
      arguments_[2],
      () => runtime.host.close(handle),
      { syscall: "close" },
    )
    write_undefined(memory, destination)
  },
  call() {
    throw new Error("call is handled by the interpreter")
  },
}

const INTRINSIC_HANDLERS = Object.freeze(Object.values(INTRINSICS))
export const INTRINSIC_NAMES = Object.freeze(Object.keys(INTRINSICS))

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
) {
  const intrinsic = INTRINSIC_HANDLERS[id]
  if (intrinsic === undefined) throw new Error(`Invalid intrinsic ID: ${id}`)
  intrinsic(runtime, destination, arguments_)
}
