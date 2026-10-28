/**
 * Values visible through the `djs:vm` module.
 * Stdlib implementation uses this module for low level interactions with
 */
import type { Heap } from "../vm/storage/heap.ts"
import type { JSValue, Persistent } from "../vm/storage/heap.ts"
import {
  VALUE_TAGS,
  heap_type_of,
  read_boolean,
  read_number,
  set_ref,
  tag_of,
  write_boolean,
  write_null,
  write_number,
  write_undefined,
} from "../vm/storage/value.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import { INSTRUCTION_BYTES } from "../compiler/bytecode.ts"
import type { CompiledModule } from "../compiler/compile.ts"
import type { Frame } from "../vm/frame.ts"
import { fileURLToPath } from "node:url"
import type { Runtime } from "../runtime/runtime.ts"
import {
  read_string,
  slice_string,
  string_from_utf16,
  string_code_unit_at,
  string_length,
  write_string,
} from "../vm/heap_types/string.ts"
import {
  create_symbol,
  load_symbol_description,
} from "../vm/heap_types/symbol.ts"
import {
  byte_buffer_view,
  create_byte_buffer,
} from "../vm/heap_types/byte_buffer.ts"
import {
  allocate_object,
  has_property_list,
  is_object,
  mark_error_object,
  object_prototype_reference,
  try_set_prototype,
} from "../vm/heap_types/object.ts"
import {
  BUILTIN_CONSTRUCTOR,
  function_code_id,
  function_flags,
  set_builtin_steps,
} from "../vm/heap_types/function.ts"
import { create_function } from "../vm/objects.ts"
import { allocate_array } from "../vm/heap_types/array.ts"
import { allocate_string_object } from "../vm/heap_types/string_object.ts"
import {
  define_own_property,
  define_property,
  delete_property,
  from_property_descriptor,
  get_own_property_descriptor,
  has_properties,
  ordinary_define_own_property,
  ordinary_own_property_keys,
  own_property_keys,
  to_property_descriptor,
  to_property_key,
} from "../vm/properties.ts"
import {
  has_slot,
  get_slot,
  set_slot,
  init_slot,
} from "../vm/internal_slots.ts"
import { OK, THROW, throw_error } from "../vm/errors.ts"
import {
  BUILTIN_CODE,
  NATIVE_CODE,
  RESUME_CODE,
} from "../vm/native_operations.ts"
import type {
  NativeOperation,
  NativeValue,
} from "../vm/native_operations.ts"
import {
  ABSTRACT_OPERATIONS,
  INTERNAL_METHODS,
  INTRINSIC_OBJECTS,
} from "../vm/realm.ts"
import type { IntrinsicObject } from "../vm/realm.ts"
import { panic } from "../utils.ts"

export const VM_PRIMITIVES: Record<string, NativeOperation> = {
  /**
   * Defines `key` on `o` from the descriptor `desc`, bypassing `o`'s exotic
   * behavior. Returns `false` if the definition is refused.
   * @see https://tc39.es/ecma262/#sec-ordinarydefineownproperty
   */
  ordinary_define_own_property(runtime, destination, [o, key, desc]) {
    const { heap } = runtime
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    return heap.handles.scope(() => {
      const descriptor = to_property_descriptor(runtime, desc)
      if (descriptor === undefined) return THROW
      write_boolean(
        heap,
        destination,
        ordinary_define_own_property(runtime, o, name, descriptor),
      )
      return OK
    })
  },
  /**
   * Deletes `key` from `o`, bypassing `o`'s exotic behavior. Returns `false` if
   * the property is non-configurable.
   * @see https://tc39.es/ecma262/#sec-ordinarydelete
   */
  ordinary_delete(runtime, destination, [o, key]) {
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    write_boolean(
      runtime.heap,
      destination,
      has_properties(runtime, o) && delete_property(runtime, o, name),
    )
    return OK
  },
  /**
   * Returns an array of `o`'s own keys in spec order, bypassing `o`'s exotic
   * behavior.
   * @see https://tc39.es/ecma262/#sec-ordinaryownpropertykeys
   */
  ordinary_own_property_keys(runtime, destination, [o]) {
    if (!has_property_list(runtime.heap, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    ordinary_own_property_keys(runtime, destination, o)
    return OK
  },
  ordinary_get_prototype_of(runtime, destination, [o]) {
    const { heap } = runtime
    if (!has_property_list(heap, o))
      return throw_error(runtime, "TypeError", "Expected an ordinary object")
    const prototype = object_prototype_reference(heap, o)
    if (prototype) set_ref(heap, destination, prototype)
    else write_null(heap, destination)
    return OK
  },
  /**
   * Sets `o`'s prototype to `proto`. Returns `false` if that would create a
   * cycle.
   * @see https://tc39.es/ecma262/#sec-ordinarysetprototypeof
   */
  ordinary_set_prototype_of(runtime, destination, [o, proto]) {
    const { heap } = runtime
    if (
      !has_property_list(heap, o) ||
      proto === undefined ||
      !is_prototype(heap, proto)
    )
      return throw_error(runtime, "TypeError", "Expected an object")
    write_boolean(heap, destination, try_set_prototype(heap, o, proto))
    return OK
  },
  /**
   * Returns a descriptor object for `o`'s own property `key` (`value`,
   * `writable`, `get`, `set`, `enumerable`, `configurable`), or `undefined`.
   * @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getownproperty-p
   */
  get_own_property(runtime, destination, [o, key]) {
    const { heap } = runtime
    if (!is_object(heap, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    heap.handles.scope(() =>
      from_property_descriptor(
        runtime,
        destination,
        get_own_property_descriptor(runtime, o, name),
      ),
    )
    return OK
  },
  /**
   * Defines `key` on `o` through its `[[DefineOwnProperty]]`, so exotic
   * behavior applies. Returns `false` if the definition is refused. Only
   * `desc`'s own data properties are read.
   * @see https://tc39.es/ecma262/#sec-object-internal-methods-and-internal-slots
   */
  define_own_property(runtime, destination, [o, key, desc]) {
    const { heap } = runtime
    if (!is_object(heap, o))
      return throw_error(runtime, "TypeError", "Expected an object")
    const name = to_property_key(runtime, key)
    if (name === undefined) return THROW
    return heap.handles.scope(() => {
      const descriptor = to_property_descriptor(runtime, desc)
      if (descriptor === undefined) return THROW
      const defined = define_own_property(runtime, o, name, descriptor)
      if (defined === undefined) return THROW
      write_boolean(heap, destination, defined)
      return OK
    })
  },
  /**
   * Calls `f` with `this` set to `this_value` and the elements of the array
   * `args` as arguments. Unlike `f.call(...)` or `f(...args)`, nothing in it
   * can be changed by a program. `call_function` runs it, so this entry only
   * reserves its ID.
   * @see https://tc39.es/ecma262/#sec-call
   */
  call(runtime) {
    return throw_error(
      runtime,
      "TypeError",
      "call is handled by the interpreter",
    )
  },
  /**
   * Creates an object of `kind` ("ordinary", "array", "string" or "error")
   * whose prototype is `proto`, an object or `null`. `slots` maps the names of
   * its internal slots to their initial values; a "string" object takes its
   * string from `"[[StringData]]"`.
   * @see https://tc39.es/ecma262/#sec-ordinaryobjectcreate
   */
  object_create(runtime, destination, [proto, kind, slots]) {
    const { heap } = runtime
    if (!is_prototype(heap, proto))
      return throw_error(runtime, "TypeError", "Expected an object or null")
    const object_kind = string_argument(runtime, kind, "Object kind")
    if (object_kind === undefined) return THROW
    return heap.handles.scope(() => {
      const object = heap.handles.local(),
        prototype = tag_of(heap, proto) === VALUE_TAGS.NULL ? undefined : proto
      let names: string[] = []
      if (slots !== undefined && tag_of(heap, slots) !== VALUE_TAGS.UNDEFINED) {
        if (!is_object(heap, slots))
          return throw_error(runtime, "TypeError", "Expected a slots object")
        names = own_property_keys(runtime, slots).names
      }
      const string_data =
        object_kind === "string"
          ? own_value(runtime, slots, "[[StringData]]")
          : undefined
      switch (object_kind) {
        case "ordinary":
        case "error":
          allocate_object(heap, object, prototype)
          if (object_kind === "error") mark_error_object(heap, object)
          break
        case "array":
          allocate_array(heap, object, 0, prototype)
          break
        case "string":
          if (!is_string(heap, string_data!))
            return throw_error(
              runtime,
              "TypeError",
              "A string object needs a [[StringData]] string",
            )
          allocate_string_object(heap, object, string_data!, prototype)
          break
        default:
          return throw_error(runtime, "TypeError", "Unknown object kind")
      }
      for (const name of names) {
        if (typeof name !== "string")
          return throw_error(runtime, "TypeError", "Expected a slot name")
        if (name === "[[StringData]]" && object_kind === "string") continue
        if (
          name === "[[Prototype]]" ||
          name === "[[Extensible]]" ||
          name === "[[StringData]]" ||
          name === "[[ErrorData]]"
        )
          return throw_error(runtime, "TypeError", `Cannot initialize ${name}`)
        const value = own_value(runtime, slots, name)
        if (value === undefined)
          return throw_error(runtime, "TypeError", "Expected a slot value")
        if (init_slot(runtime, object, name, value) === THROW) return THROW
      }
      heap.copy_value(destination, object)
      return OK
    })
  },
  /**
   * Creates a built-in function that runs the JS function `behavior` when
   * called. `options` may give its `name` and `length`, which default to
   * `behavior`'s, and `constructor: true` to allow `new`.
   * @see https://tc39.es/ecma262/#sec-createbuiltinfunction
   */
  create_builtin_function(runtime, destination, [behavior, options]) {
    const { heap } = runtime
    if (
      behavior === undefined ||
      heap_type_of(heap, behavior) !== HEAP_TYPES.FUNCTION ||
      [NATIVE_CODE, RESUME_CODE, BUILTIN_CODE].includes(
        function_code_id(heap, behavior),
      )
    )
      return throw_error(runtime, "TypeError", "Expected a JavaScript function")
    if (
      options !== undefined &&
      tag_of(heap, options) !== VALUE_TAGS.UNDEFINED &&
      !is_object(heap, options)
    )
      return throw_error(runtime, "TypeError", "Expected an options object")
    const option = (name: string) =>
      options !== undefined && is_object(heap, options)
        ? own_value(runtime, options, name)
        : undefined
    return heap.handles.scope(() => {
      const length = option("length") ?? own_value(runtime, behavior, "length")
      const name = option("name") ?? own_value(runtime, behavior, "name")
      const constructor = option("constructor")
      if (
        length === undefined ||
        tag_of(heap, length) !== VALUE_TAGS.NUMBER ||
        name === undefined ||
        !is_string(heap, name)
      )
        return throw_error(runtime, "TypeError", "Invalid name or length")
      const result = heap.handles.local()
      create_function(runtime, result, BUILTIN_CODE, 0)
      set_builtin_steps(
        heap,
        result,
        behavior,
        constructor !== undefined &&
          tag_of(heap, constructor) === VALUE_TAGS.BOOLEAN &&
          read_boolean(heap, constructor),
      )
      define_property(runtime, result, "length", {
        value: length,
        configurable: true,
      })
      define_property(runtime, result, "name", {
        value: name,
        configurable: true,
      })
      heap.copy_value(destination, result)
      return OK
    })
  },
  /**
   * Returns the kind `o` was created as: "ordinary", "array", "string",
   * "error" or "function", or `undefined` if it isn't an object.
   */
  kind_of({ heap }, destination, [o]) {
    const kind =
      o !== undefined && is_object(heap, o)
        ? OBJECT_KINDS[heap_type_of(heap, o)]
        : undefined
    if (kind === undefined) write_undefined(heap, destination)
    else write_string(heap, destination, kind)
    return OK
  },
  is_constructor({ heap }, destination, [f]) {
    let result = false
    if (f !== undefined && heap_type_of(heap, f) === HEAP_TYPES.FUNCTION) {
      const code = function_code_id(heap, f)
      const flags = function_flags(heap, f)
      result =
        code === BUILTIN_CODE
          ? Boolean(flags & BUILTIN_CONSTRUCTOR)
          : code !== NATIVE_CODE && code !== RESUME_CODE && !(flags & 14)
    }
    write_boolean(heap, destination, result)
    return OK
  },
  has_slot(runtime, destination, [o, name]) {
    const slot_name = string_argument(runtime, name, "Slot name")
    if (slot_name === undefined) return THROW
    write_boolean(
      runtime.heap,
      destination,
      o !== undefined && has_slot(runtime, o, slot_name),
    )
    return OK
  },
  get_slot(runtime, destination, [o, name]) {
    const slot_name = string_argument(runtime, name, "Slot name")
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
    const slot_name = string_argument(runtime, name, "Slot name")
    if (slot_name === undefined) return THROW
    if (o === undefined || value === undefined)
      return throw_error(runtime, "TypeError", "Expected an object and value")
    if (set_slot(runtime, o, slot_name, value) === THROW) return THROW
    write_undefined(runtime.heap, destination)
    return OK
  },
  /**
   * Creates a symbol whose description is the string `description`, or none if
   * `undefined`.
   */
  symbol_create(runtime, destination, [description]) {
    const { heap } = runtime
    if (
      description !== undefined &&
      tag_of(heap, description) !== VALUE_TAGS.UNDEFINED &&
      heap_type_of(heap, description) !== HEAP_TYPES.STRING
    )
      return throw_error(
        runtime,
        "TypeError",
        "Symbol description must be a string or undefined",
      )
    create_symbol(heap, destination, description)
    return OK
  },
  symbol_description(runtime, destination, [symbol]) {
    const { heap } = runtime
    if (
      symbol === undefined ||
      heap_type_of(heap, symbol) !== HEAP_TYPES.SYMBOL
    )
      return throw_error(runtime, "TypeError", "Expected a symbol")
    load_symbol_description(heap, destination, symbol)
    return OK
  },
  string_code_unit_at(runtime, destination, [s, index]) {
    const { heap } = runtime
    if (!is_string(heap, s))
      return throw_error(runtime, "TypeError", "Expected a string")
    const string_index = integer_argument(runtime, index, "string index")
    if (string_index < 0) return THROW
    if (string_index >= string_length(heap, s))
      return throw_error(runtime, "RangeError", "Invalid string index")
    write_number(heap, destination, string_code_unit_at(heap, s, string_index))
    return OK
  },
  string_slice(runtime, destination, [s, start, end]) {
    const { heap } = runtime
    if (!is_string(heap, s))
      return throw_error(runtime, "TypeError", "Expected a string")
    const start_index = integer_argument(runtime, start, "start")
    if (start_index < 0) return THROW
    const end_index = integer_argument(runtime, end, "end")
    if (end_index < 0) return THROW
    if (end_index < start_index || end_index > string_length(heap, s))
      return throw_error(runtime, "RangeError", "Invalid string range")
    slice_string(heap, destination, s, start_index, end_index)
    return OK
  },
  /**
   * Creates a string from code units `start` up to `end` of `buffer`, which
   * holds little-endian UTF-16. Lets JS decoders build a string in one step
   * instead of appending character by character.
   */
  string_from_utf16(runtime, destination, [buffer, start, end]) {
    const { heap } = runtime
    if (
      buffer === undefined ||
      heap_type_of(heap, buffer) !== HEAP_TYPES.BYTE_BUFFER
    )
      return throw_error(runtime, "TypeError", "Expected a byte buffer")
    const start_index = integer_argument(runtime, start, "start")
    if (start_index < 0) return THROW
    const end_index = integer_argument(runtime, end, "end")
    if (end_index < 0) return THROW
    if (
      end_index < start_index ||
      end_index * 2 > byte_buffer_view(heap, buffer).length
    )
      return throw_error(runtime, "RangeError", "Invalid code unit range")
    string_from_utf16(heap, destination, buffer, start_index, end_index)
    return OK
  },
  string_from_code_unit(runtime, destination, [unit]) {
    const code_unit = integer_argument(runtime, unit, "code unit", 0xffff)
    if (code_unit < 0) return THROW
    write_string(runtime.heap, destination, String.fromCharCode(code_unit))
    return OK
  },
  byte_buffer(runtime, destination, [length]) {
    const byte_length = integer_argument(runtime, length, "byte buffer length")
    if (byte_length < 0) return THROW
    if (byte_length > 0x7ffffff0)
      return throw_error(runtime, "RangeError", "Invalid byte buffer length")
    create_byte_buffer(runtime.heap, destination, byte_length)
    return OK
  },
  /** See `stack_trace`. */
  capture_stack(runtime, destination) {
    write_string(runtime.heap, destination, stack_trace(runtime))
    return OK
  },
  /**
   * Fills the VM's slot for the abstract operation `name` with `fn`. Throws
   * once the realm is built.
   */
  set_abstract_operation(runtime, destination, [name, fn]) {
    const operation = string_argument(runtime, name, "Operation name")
    if (operation === undefined) return THROW
    return register(
      runtime,
      destination,
      runtime.realm.abstract_operations,
      ABSTRACT_OPERATIONS,
      operation,
      fn,
    )
  },
  /**
   * Fills the VM's slot for the internal method `method` of objects of
   * `kind` with `fn`, which runs with `this` set to the object. Throws once
   * the realm is built.
   */
  set_internal_method(runtime, destination, [kind, method, fn]) {
    const object_kind = string_argument(runtime, kind, "Object kind")
    if (object_kind === undefined) return THROW
    const method_name = string_argument(runtime, method, "Method name")
    if (method_name === undefined) return THROW
    return register(
      runtime,
      destination,
      runtime.realm.internal_methods,
      INTERNAL_METHODS,
      `${object_kind} ${method_name}`,
      fn,
    )
  },
}

export const VM_VALUES: Record<string, NativeValue> = {
  /**
   * The objects the VM creates before the stdlib runs, keyed by spec name
   * (`"%Array.prototype%"`). Only those in `INTRINSIC_OBJECTS`: the stdlib
   * creates the rest of the spec's well-known intrinsics, like `%Array%`.
   * @see https://tc39.es/ecma262/#sec-well-known-intrinsic-objects
   */
  well_known_intrinsic_objects(runtime, destination) {
    // An object with no prototype, so reading from it never reaches anything
    // a program can change.
    allocate_object(runtime.heap, destination, undefined)
    for (const [name, spec_name] of Object.entries(INTRINSIC_OBJECTS)) {
      const object = runtime.realm.intrinsics[name as IntrinsicObject]
      if (object === undefined) panic(`${name} is not created yet`)
      define_property(runtime, destination, spec_name, {
        value: object,
        enumerable: true,
      })
    }
  },
  /** Keyed by name without the "Symbol." prefix. */
  well_known_symbols(runtime, destination) {
    allocate_object(runtime.heap, destination, undefined)
    for (const [name, symbol] of runtime.realm.well_known_symbols)
      define_property(runtime, destination, name, {
        value: symbol,
        enumerable: true,
      })
  },
}

// Returns -1 after raising, since valid arguments are never negative.
export function integer_argument(
  runtime: Runtime,
  value: JSValue,
  name: string,
  maximum: number = Number.MAX_SAFE_INTEGER,
) {
  const { heap } = runtime
  if (value === undefined) {
    throw_error(runtime, "TypeError", `${name} is required`)
    return -1
  }
  if (tag_of(heap, value) !== VALUE_TAGS.NUMBER) {
    throw_error(runtime, "TypeError", "Expected a numeric value")
    return -1
  }
  const number = read_number(heap, value)
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
    throw_error(runtime, "RangeError", `Invalid ${name}`)
    return -1
  }
  return number
}

// Returns undefined after raising.
export function string_argument(
  runtime: Runtime,
  value: JSValue,
  name: string,
) {
  if (
    value === undefined ||
    heap_type_of(runtime.heap, value) !== HEAP_TYPES.STRING
  ) {
    throw_error(runtime, "TypeError", `${name} must be a string`)
    return undefined
  }
  return read_string(runtime.heap, value)
}

const STDLIB_DIRECTORY = fileURLToPath(new URL("../stdlib/", import.meta.url))

/**
 * The `    at ...` lines of the stack trace for the code that's running,
 * starting at the innermost frame outside the stdlib.
 */
export function stack_trace(runtime: Runtime) {
  const lines = []
  for (let frame = runtime.current_frame; frame; frame = frame.caller) {
    const { unit } = runtime.loader.code[frame.code_id]
    if (lines.length === 0 && unit.path.startsWith(STDLIB_DIRECTORY)) continue
    lines.push(`\n    at ${frame_location(unit, frame)}`)
  }
  return lines.join("")
}

/** The kinds `object_create` makes and `kind_of` reports. */
const OBJECT_KINDS: Partial<Record<number, string>> = {
  [HEAP_TYPES.OBJECT]: "ordinary",
  [HEAP_TYPES.ARRAY]: "array",
  [HEAP_TYPES.STRING_OBJECT]: "string",
  [HEAP_TYPES.ERROR]: "error",
  [HEAP_TYPES.FUNCTION]: "function",
}

function function_argument(runtime: Runtime, value: JSValue, name: string) {
  if (
    value === undefined ||
    heap_type_of(runtime.heap, value) !== HEAP_TYPES.FUNCTION
  ) {
    throw_error(runtime, "TypeError", `${name} must be a function`)
    return false
  }
  return true
}

function register<Name extends string>(
  runtime: Runtime,
  destination: JSValue,
  slots: Map<Name, Persistent>,
  names: readonly string[],
  name: string,
  fn: JSValue,
) {
  if (runtime.realm.frozen)
    return throw_error(runtime, "TypeError", "The realm is frozen")
  if (!names.includes(name))
    return throw_error(runtime, "TypeError", `Unknown slot: ${name}`)
  if (slots.has(name as Name))
    return throw_error(runtime, "TypeError", `${name} is already registered`)
  if (!function_argument(runtime, fn, name)) return THROW
  const slot = runtime.heap.handles.persistent()
  runtime.heap.copy_value(slot, fn)
  slots.set(name as Name, slot)
  write_undefined(runtime.heap, destination)
  return OK
}

function is_string(heap: Heap, value: JSValue) {
  return value !== undefined && heap_type_of(heap, value) === HEAP_TYPES.STRING
}

function is_prototype(heap: Heap, value: JSValue | undefined) {
  return (
    value !== undefined &&
    (tag_of(heap, value) === VALUE_TAGS.NULL || has_property_list(heap, value))
  )
}

// Reads `name` only if `object` has it as an own data property, so the
// stdlib's option and slot objects can't pick up properties a program added
// to %Object.prototype%.
function own_value(runtime: Runtime, object: JSValue, name: string) {
  const descriptor = get_own_property_descriptor(runtime, object, name)
  return descriptor?.value
}

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
