import type { Address, Handle } from "../storage/value.ts"
import {
  VALUE_TAGS,
  get_ref,
  heap_type_of,
  read_number,
  set_ref,
  tag_of,
  write_boolean,
  write_number,
  write_undefined,
} from "../storage/value.ts"
import { HEAP_TYPES } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import {
  heap_string_code_unit_at,
  heap_string_length,
  read_string,
  write_string,
} from "../heap_types/string.ts"
import { byte_buffer_view } from "../heap_types/byte_buffer.ts"
import { string_reference } from "../heap_types/string_object.ts"
import {
  has_property_list,
  is_object,
  object_properties,
  object_prototype_reference,
} from "../heap_types/object.ts"
import type { PropertyKey } from "../heap_types/property.ts"
import {
  find_property,
  insert_property,
  load_property_key,
  load_property_setter,
  load_property_value,
  next_property,
  property_flags,
  remove_property,
  set_property_flags,
  store_property_setter,
  store_property_value,
} from "../heap_types/property.ts"
import { create_array, create_object } from "./objects.ts"
import { same_value, to_string, truthy, write_primitive } from "./operations.ts"
import { invoke_sync, coerce_value } from "../execution/calls.ts"
import { panic } from "../../utils.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

export type { PropertyKey } from "../heap_types/property.ts"

/** Values whose properties the VM can read without boxing. */
export function has_properties(runtime: Runtime, value: Handle) {
  const type = heap_type_of(runtime.heap, value)
  return (
    type === HEAP_TYPES.STRING ||
    type === HEAP_TYPES.SYMBOL ||
    is_object(runtime.heap, value)
  )
}

export function property_key(runtime: Runtime, key: Handle): PropertyKey {
  return heap_type_of(runtime.heap, key) === HEAP_TYPES.SYMBOL
    ? key
    : to_string(runtime, key)
}

function array_index(name: string) {
  const index = Number(name)
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 0xffffffff &&
    String(index) === name
    ? index
    : -1
}

/** Physical properties point into the heap; virtual properties store host data. */
export interface OwnProperty {
  flags: number
  property?: Address
  value?: string | number
}

// Virtual descriptors contain only host numbers/strings, never heap addresses.
function virtual_property(
  runtime: Runtime,
  object: Handle,
  name: PropertyKey,
): OwnProperty | undefined {
  const { heap } = runtime
  if (typeof name !== "string") return undefined
  const reference = string_reference(heap, object)
  if (reference) {
    const length = heap_string_length(heap, reference)
    if (name === "length") return { flags: 0, value: length }
    const index = array_index(name)
    if (index >= 0 && index < length)
      return {
        flags: 2,
        value: String.fromCharCode(
          heap_string_code_unit_at(heap, reference, index),
        ),
      }
  }
  if (heap_type_of(heap, object) === HEAP_TYPES.BYTE_BUFFER) {
    const bytes = byte_buffer_view(heap, object)
    if (name === "length") return { flags: 0, value: bytes.length }
    const index = array_index(name)
    if (index >= 0 && index < bytes.length)
      return { flags: 3, value: bytes[index] }
  }
}

export function own_property(
  runtime: Runtime,
  object: Handle,
  name: PropertyKey,
): OwnProperty | undefined {
  const { heap } = runtime
  const virtual = virtual_property(runtime, object, name)
  if (virtual) return virtual
  const type = heap_type_of(heap, object)
  if (
    type === HEAP_TYPES.STRING ||
    type === HEAP_TYPES.SYMBOL ||
    type === HEAP_TYPES.BYTE_BUFFER
  )
    return undefined
  const property = find_property(heap, object, name, true)
  return property
    ? { property, flags: property_flags(heap, property) }
    : undefined
}

// Strings and symbols inherit from the realm's prototypes.
function prototype_reference(runtime: Runtime, value: Handle): Address {
  const { heap, realm } = runtime
  const type = heap_type_of(heap, value)
  const prototype =
    type === HEAP_TYPES.STRING
      ? realm.string_prototype
      : type === HEAP_TYPES.SYMBOL
        ? realm.symbol_prototype
        : null
  if (prototype !== null)
    return prototype === undefined ? 0 : get_ref(heap, prototype)
  if (type === HEAP_TYPES.BYTE_BUFFER) return 0
  return object_prototype_reference(heap, value)
}

// Return an accessor flag; only the interpreter invokes guest getters.
export function get_property(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: Handle,
) {
  const { heap } = runtime
  const name = property_key(runtime, key)
  return heap.handles.scope(() => {
    const current = heap.handles.local()
    heap.copy_value(current, object)
    while (true) {
      const descriptor = own_property(runtime, current, name)
      if (descriptor) {
        if (descriptor.property)
          load_property_value(heap, destination, descriptor.property)
        else write_primitive(runtime, destination, descriptor.value)
        return descriptor.flags & 16 ? 1 : 0
      }
      const prototype = prototype_reference(runtime, current)
      if (!prototype) break
      set_ref(heap, current, prototype)
    }
    write_undefined(heap, destination)
    return 0
  })
}

export function has_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  own: boolean = false,
) {
  const { heap } = runtime
  const name = property_key(runtime, key)
  return heap.handles.scope(() => {
    const current = heap.handles.local()
    heap.copy_value(current, object)
    while (true) {
      if (own_property(runtime, current, name)) return true
      if (own) return false
      const prototype = prototype_reference(runtime, current)
      if (!prototype) return false
      set_ref(heap, current, prototype)
    }
  })
}

/** Returns false when the property is non-configurable. */
export function delete_property(runtime: Runtime, object: Handle, key: Handle) {
  const name = property_key(runtime, key)
  if (virtual_property(runtime, object, name)) return false
  if (!has_property_list(runtime.heap, object)) return true
  return remove_property(runtime.heap, object, name)
}

export function define_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags: number = 7,
  setter?: Handle,
) {
  if (!try_define_property(runtime, object, key, value, flags, setter))
    panic("Cannot redefine property")
}

/** Returns false when an existing non-configurable property forbids the change. */
export function try_define_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags: number = 7,
  setter?: Handle,
) {
  const { heap } = runtime
  const name = flags & 8 ? undefined : property_key(runtime, key)
  const virtual =
    name === undefined ? undefined : virtual_property(runtime, object, name)
  if (virtual) {
    return heap.handles.scope(() => {
      const previous = heap.handles.local()
      write_primitive(runtime, previous, virtual.value)
      return flags === virtual.flags && same_value(runtime, previous, value)
    })
  }
  return ordinary_define_property(runtime, object, key, value, flags, setter)
}

function ordinary_define_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags: number = 7,
  setter?: Handle,
) {
  const { heap } = runtime
  const private_key = Boolean(flags & 8)
  const property = find_property(
    heap,
    object,
    private_key ? key : property_key(runtime, key),
    true,
    private_key,
  )
  if (property !== 0) {
    const previous_flags = property_flags(heap, property)
    if (!(previous_flags & 4)) {
      if (
        (flags & (2 | 4 | 16)) !== (previous_flags & (2 | 16)) ||
        (!(previous_flags & 1) && flags & 1)
      )
        return false
      if (previous_flags & 16 || !(previous_flags & 1)) {
        const same = heap.handles.scope(() => {
          const previous = heap.handles.local()
          if (flags & 16 && setter !== undefined)
            load_property_setter(heap, previous, property)
          else load_property_value(heap, previous, property)
          return same_value(runtime, previous, value)
        })
        if (!same) return false
      }
    }
    if (flags & 16) {
      if (!(previous_flags & 16)) {
        set_property_flags(heap, property, flags)
        heap.handles.scope(() => {
          const empty = heap.handles.local()
          store_property_value(heap, property, empty)
          store_property_setter(heap, property, empty)
        })
      }
      if (setter === undefined) store_property_value(heap, property, value)
      else store_property_setter(heap, property, value)
      set_property_flags(heap, property, flags)
      return true
    }
    set_property_flags(heap, property, flags)
    store_property_value(heap, property, value)
    if (previous_flags & 16) {
      heap.handles.scope(() => {
        const empty = heap.handles.local()
        store_property_setter(heap, property, empty)
      })
    }
    return true
  }
  return heap.handles.scope(() => {
    const normalized = heap.handles.local()
    if (
      private_key ||
      heap_type_of(heap, key) === HEAP_TYPES.STRING ||
      heap_type_of(heap, key) === HEAP_TYPES.SYMBOL
    )
      heap.copy_value(normalized, key)
    else write_string(heap, normalized, to_string(runtime, key))
    insert_property(
      heap,
      object,
      normalized,
      flags,
      value,
      Boolean(flags & 16 && setter !== undefined),
    )
    return true
  })
}

export type DefineValue = (
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags?: number,
  setter?: Handle,
  value_only?: boolean,
) => Status

function define_ordinary_value(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags?: number,
) {
  if (!try_define_property(runtime, object, key, value, flags))
    return throw_error(runtime, "TypeError", "Cannot redefine property")
  return OK
}

/** Loads the setter into `setter` when the assignment must call one. */
export function set_property(
  runtime: Runtime,
  setter: Handle,
  object: Handle,
  key: Handle,
  value: Handle,
  define: DefineValue = define_ordinary_value,
): Status {
  const { heap } = runtime
  write_undefined(heap, setter)
  if (heap_type_of(heap, object) === HEAP_TYPES.BYTE_BUFFER) {
    const name =
        heap_type_of(heap, key) === HEAP_TYPES.SYMBOL
          ? ""
          : to_string(runtime, key),
      index = Number(name),
      bytes = byte_buffer_view(heap, object)
    if (name === "length")
      return throw_error(runtime, "TypeError", "Byte buffer length is readonly")
    if (
      String(index) !== name ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= bytes.length
    )
      return throw_error(runtime, "RangeError", "Invalid byte buffer index")
    if (tag_of(heap, value) !== VALUE_TAGS.NUMBER)
      return throw_error(runtime, "TypeError", "Expected a numeric value")
    bytes[index] = read_number(heap, value)
    return OK
  }
  const name = property_key(runtime, key)
  if (
    heap_type_of(heap, object) === HEAP_TYPES.STRING ||
    virtual_property(runtime, object, name)
  )
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to readonly string property",
    )
  return heap.handles.scope(() => {
    const current = heap.handles.local()
    heap.copy_value(current, object)
    while (true) {
      const descriptor = own_property(runtime, current, name)
      if (descriptor) {
        if (descriptor.flags & 16) {
          load_property_setter(heap, setter, descriptor.property!)
          if (tag_of(heap, setter) === VALUE_TAGS.UNDEFINED)
            return throw_error(runtime, "TypeError", "Property has no setter")
          return OK
        }
        if (!(descriptor.flags & 1))
          return throw_error(
            runtime,
            "TypeError",
            "Cannot assign to readonly property",
          )
        break
      }
      const prototype = prototype_reference(runtime, current)
      if (!prototype) break
      set_ref(heap, current, prototype)
    }
    if (!has_property_list(heap, object))
      return throw_error(runtime, "TypeError", "Expected an object")
    const own = own_property(runtime, object, name)
    return define(
      runtime,
      object,
      key,
      value,
      own ? own.flags : 7,
      undefined,
      Boolean(own),
    )
  })
}

export function private_property(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: Handle,
  value: Handle | undefined,
  initialize: boolean = false,
  has: boolean = false,
  readonly: boolean = false,
): Status {
  const { heap } = runtime
  if (has && heap_type_of(heap, object) === HEAP_TYPES.BYTE_BUFFER) {
    write_boolean(heap, destination, false)
    return OK
  }
  if (!has_property_list(heap, object))
    return throw_error(
      runtime,
      "TypeError",
      has ? "Private brand check requires an object" : "Expected an object",
    )
  const property = find_property(heap, object, key, true, true)
  if (has) {
    write_boolean(heap, destination, property !== 0)
    return OK
  }
  if (initialize) {
    if (property !== 0)
      return throw_error(
        runtime,
        "TypeError",
        "Private field is already initialized",
      )
    define_property(runtime, object, key, value!, readonly ? 8 : 9)
  } else {
    if (property === 0)
      return throw_error(runtime, "TypeError", "Invalid private field receiver")
    if (value === undefined) load_property_value(heap, destination, property)
    else {
      if (!(property_flags(heap, property) & 1))
        return throw_error(runtime, "TypeError", "Private method is readonly")
      store_property_value(heap, property, value)
    }
  }
  return OK
}

/**
 * Own string keys in property order, followed by symbol keys. The symbols are
 * local handles in the caller's scope, since creating the result moves them.
 */
function own_property_keys(runtime: Runtime, object: Handle) {
  const { heap } = runtime
  const names = []
  const symbols: Handle[] = []
  const key = heap.handles.local()
  let property = object_properties(heap, object)
  while (property) {
    if (!(property_flags(heap, property) & 8)) {
      load_property_key(heap, key, property)
      if (heap_type_of(heap, key) === HEAP_TYPES.SYMBOL) {
        const symbol = heap.handles.local()
        heap.copy_value(symbol, key)
        symbols.push(symbol)
      } else names.push(read_string(heap, key))
    }
    property = next_property(heap, property)
  }
  names.reverse()
  symbols.reverse()
  if (heap_type_of(heap, object) === HEAP_TYPES.STRING_OBJECT) {
    const reference = string_reference(heap, object)
    const length = heap_string_length(heap, reference)
    for (let index = 0; index < length; index++) names.push(String(index))
    names.unshift("length")
  }
  const indices = names
    .filter((name) => array_index(name) >= 0)
    .sort((a, b) => Number(a) - Number(b))
  return {
    names: indices.concat(names.filter((name) => array_index(name) < 0)),
    symbols,
  }
}

export function ordinary_own_property_keys(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const { names: ordered, symbols } = own_property_keys(runtime, object)
    const key = heap.handles.local(),
      value = heap.handles.local()
    create_array(runtime, destination, ordered.length + symbols.length)
    for (let index = 0; index < ordered.length; index++) {
      write_string(heap, key, String(index))
      write_string(heap, value, ordered[index])
      ordinary_define_property(runtime, destination, key, value, 7)
    }
    for (let index = 0; index < symbols.length; index++) {
      write_string(heap, key, String(ordered.length + index))
      ordinary_define_property(runtime, destination, key, symbols[index], 7)
    }
  })
}

export function get_own_property_descriptor(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: Handle,
) {
  const { heap } = runtime
  const descriptor = own_property(runtime, object, property_key(runtime, key))
  if (!descriptor) {
    write_undefined(heap, destination)
    return
  }
  heap.handles.scope(() => {
    const value = heap.handles.local(),
      setter = heap.handles.local(),
      name = heap.handles.local()
    // Snapshot referenced values before allocating the result object.
    if (descriptor.property) {
      load_property_value(heap, value, descriptor.property)
      if (descriptor.flags & 16)
        load_property_setter(heap, setter, descriptor.property)
    } else if (typeof descriptor.value === "string")
      write_string(heap, value, descriptor.value!)
    else {
      // The virtual numeric fields are length and byte-buffer elements.
      write_number(heap, value, descriptor.value!)
    }
    create_object(runtime, destination)
    write_string(heap, name, descriptor.flags & 16 ? "get" : "value")
    define_property(runtime, destination, name, value)
    write_string(heap, name, descriptor.flags & 16 ? "set" : "writable")
    if (!(descriptor.flags & 16))
      write_boolean(heap, setter, Boolean(descriptor.flags & 1))
    define_property(runtime, destination, name, setter)
    for (const [field, mask] of [
      ["enumerable", 2],
      ["configurable", 4],
    ] as [string, number][]) {
      write_string(heap, name, field)
      write_boolean(heap, value, Boolean(descriptor.flags & mask))
      define_property(runtime, destination, name, value)
    }
  })
}

// Descriptors from native operations are trusted records of data fields.
// Public Object APIs can perform observable descriptor conversion in the stdlib
// before calling us.
export function define_own_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  descriptor: Handle,
  ordinary: boolean = false,
): Status {
  const { heap } = runtime
  if (!ordinary) {
    const status = dispatch_define(runtime, object, key, descriptor)
    if (status !== null) return status
  }
  if (!has_property_list(heap, object))
    return throw_error(runtime, "TypeError", "Expected an object")
  if (!is_object(heap, descriptor))
    return throw_error(runtime, "TypeError", "Expected a property descriptor")
  return heap.handles.scope(() => {
    const name = heap.handles.local(),
      value = heap.handles.local(),
      getter = heap.handles.local(),
      setter = heap.handles.local()
    const previous = own_property(runtime, object, property_key(runtime, key))
    let flags = previous?.flags ?? 0
    if (flags & 16) flags &= ~1
    if (previous?.property) {
      load_property_value(heap, value, previous.property)
      if (flags & 16) {
        load_property_value(heap, getter, previous.property)
        load_property_setter(heap, setter, previous.property)
      }
    } else if (previous) {
      if (typeof previous.value === "string")
        write_string(heap, value, previous.value!)
      else write_number(heap, value, previous.value!)
    }
    // Fields are absent, present, or THROW for accessor fields.
    function field(field_name: string, target: Handle) {
      write_string(heap, name, field_name)
      if (!has_property(runtime, descriptor, name)) return false
      if (get_property(runtime, target, descriptor, name))
        return throw_error(
          runtime,
          "TypeError",
          "Native operation descriptor fields must be data properties",
        )
      return true
    }
    const accessor = field("get", getter)
    if (accessor === THROW) return THROW
    const has_setter = field("set", setter)
    if (has_setter === THROW) return THROW
    const has_value = field("value", value)
    if (has_value === THROW) return THROW
    const writable = heap.handles.local()
    const has_writable = field("writable", writable)
    if (has_writable === THROW) return THROW
    if ((accessor || has_setter) && (has_value || has_writable))
      return throw_error(
        runtime,
        "TypeError",
        "Invalid mixed property descriptor",
      )
    if (accessor || has_setter) {
      if (
        (accessor &&
          tag_of(heap, getter) !== VALUE_TAGS.UNDEFINED &&
          heap_type_of(heap, getter) !== HEAP_TYPES.FUNCTION) ||
        (has_setter &&
          tag_of(heap, setter) !== VALUE_TAGS.UNDEFINED &&
          heap_type_of(heap, setter) !== HEAP_TYPES.FUNCTION)
      )
        return throw_error(
          runtime,
          "TypeError",
          "Accessor must be callable or undefined",
        )
      if (!accessor && flags & 16) {
        const current = own_property(
          runtime,
          object,
          property_key(runtime, key),
        )
        load_property_value(heap, getter, current!.property!)
      }
      if (!(flags & 16) && !has_setter) write_undefined(heap, setter)
      flags = (flags & ~1) | 16
    } else if (has_value || has_writable) {
      if (flags & 16) {
        flags &= ~16
        if (!has_value) write_undefined(heap, value)
      }
      if (has_writable)
        flags = truthy(runtime, writable) ? flags | 1 : flags & ~1
    }
    for (const [field_name, mask] of [
      ["enumerable", 2],
      ["configurable", 4],
    ] as [string, number][]) {
      const present = field(field_name, writable)
      if (present === THROW) return THROW
      if (present)
        flags = truthy(runtime, writable) ? flags | mask : flags & ~mask
    }
    if (flags & 16) {
      // Validate a non-configurable accessor's two fields before changing either.
      const current = own_property(runtime, object, property_key(runtime, key))
      if (current && !(current.flags & 4)) {
        if (flags !== (current.flags & ~1))
          return throw_error(runtime, "TypeError", "Cannot redefine property")
        load_property_value(heap, value, current!.property!)
        if (!same_reference(runtime, value, getter))
          return throw_error(runtime, "TypeError", "Cannot redefine property")
        load_property_setter(heap, value, current!.property!)
        if (!same_reference(runtime, value, setter))
          return throw_error(runtime, "TypeError", "Cannot redefine property")
        return OK
      }
      if (!try_define_property(runtime, object, key, getter, flags))
        return throw_error(runtime, "TypeError", "Cannot redefine property")
      const property = own_property(
        runtime,
        object,
        property_key(runtime, key),
      )!.property!
      store_property_setter(heap, property, setter)
    } else if (!try_define_property(runtime, object, key, value, flags))
      return throw_error(runtime, "TypeError", "Cannot redefine property")
    return OK
  })
}

function same_reference(runtime: Runtime, left: Handle, right: Handle) {
  const { heap } = runtime
  return (
    tag_of(heap, left) === tag_of(heap, right) &&
    (tag_of(heap, left) === VALUE_TAGS.UNDEFINED ||
      get_ref(heap, left) === get_ref(heap, right))
  )
}

function invoke_define(
  runtime: Runtime,
  method: Handle,
  object: Handle,
  key: Handle,
  descriptor: Handle,
): Status {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const result = heap.handles.local(),
      normalized = heap.handles.local()
    if (
      heap_type_of(heap, key) === HEAP_TYPES.STRING ||
      heap_type_of(heap, key) === HEAP_TYPES.SYMBOL
    )
      heap.copy_value(normalized, key)
    else if (is_object(heap, key)) {
      if (coerce_value(runtime, normalized, key, "ToString") === THROW)
        return THROW
    } else write_string(heap, normalized, to_string(runtime, key))
    if (
      invoke_sync(runtime, result, method, object, [normalized, descriptor]) ===
      THROW
    )
      return THROW
    if (tag_of(heap, result) !== VALUE_TAGS.BOOLEAN)
      return throw_error(
        runtime,
        "TypeError",
        "DefineOwnProperty must return a boolean",
      )
    if (!truthy(runtime, result))
      return throw_error(runtime, "TypeError", "Cannot define property")
    return OK
  })
}

// Array exotic objects define properties through the stdlib's
// @internal_method("array", "[[DefineOwnProperty]]"); other objects are ordinary.
function exotic_define_own_property(runtime: Runtime, object: Handle) {
  if (heap_type_of(runtime.heap, object) !== HEAP_TYPES.ARRAY) return undefined
  return runtime.realm.intrinsics.get("array [[DefineOwnProperty]]")
}

// Returns null when the object is ordinary.
function dispatch_define(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  descriptor: Handle,
): Status | null {
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined) return null
  return invoke_define(runtime, method, object, key, descriptor)
}

export function define_value_property(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags: number = 7,
  setter?: Handle,
  value_only: boolean = false,
): Status {
  const { heap } = runtime
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined) {
    if (!try_define_property(runtime, object, key, value, flags, setter))
      return throw_error(runtime, "TypeError", "Cannot redefine property")
    return OK
  }
  return heap.handles.scope(() => {
    const descriptor = heap.handles.local(),
      name = heap.handles.local(),
      field = heap.handles.local()
    create_object(runtime, descriptor)
    write_string(
      heap,
      name,
      flags & 16 ? (setter === undefined ? "get" : "set") : "value",
    )
    define_property(runtime, descriptor, name, value)
    if (!value_only) {
      for (const [text, mask] of [
        ["writable", 1],
        ["enumerable", 2],
        ["configurable", 4],
      ] as [string, number][]) {
        if (mask === 1 && flags & 16) continue
        write_string(heap, name, text)
        write_boolean(heap, field, Boolean(flags & mask))
        define_property(runtime, descriptor, name, field)
      }
    }
    return invoke_define(runtime, method, object, key, descriptor)
  })
}
