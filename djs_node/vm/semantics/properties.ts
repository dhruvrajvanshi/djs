import type { Address } from "../storage/value.ts"
import type { Handle } from "../storage/heap.ts"
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
import {
  HEAP_TYPES,
  PROPERTY_FLAGS,
  type PropertyFlags,
} from "../storage/layout.ts"
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
import { call, coerce_value } from "../execution/calls.ts"
import { panic } from "../../utils.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

const { WRITABLE, ENUMERABLE, CONFIGURABLE, PRIVATE, ACCESSOR } = PROPERTY_FLAGS

export type { PropertyKey } from "../heap_types/property.ts"

/**
 * A property's attributes and contents, copied into handles in the caller's
 * handle scope.
 * @see https://tc39.es/ecma262/#sec-property-descriptor-specification-type
 */
export type PropertyDescriptor =
  | {
      kind: "data"
      value: Handle
      writable: boolean
      enumerable: boolean
      configurable: boolean
    }
  | {
      kind: "accessor"
      get: Handle
      set: Handle
      enumerable: boolean
      configurable: boolean
    }

/** Values whose properties the VM can read without boxing. */
export function has_properties(runtime: Runtime, value: Handle) {
  const type = heap_type_of(runtime.heap, value)
  return (
    type === HEAP_TYPES.STRING ||
    type === HEAP_TYPES.SYMBOL ||
    is_object(runtime.heap, value)
  )
}

/** The key for a primitive value. Objects need `to_property_key`. */
export function property_key(runtime: Runtime, key: Handle): PropertyKey {
  const { heap } = runtime
  if (heap_type_of(heap, key) === HEAP_TYPES.SYMBOL) return key
  if (is_object(heap, key)) panic("Object keys need to_property_key")
  return to_string(runtime, key)
}

/**
 * Converts an object key with its `toString`, which can throw. Returns
 * undefined after raising.
 * @see https://tc39.es/ecma262/#sec-topropertykey
 */
export function to_property_key(
  runtime: Runtime,
  key: Handle,
): PropertyKey | undefined {
  const { heap } = runtime
  if (!is_object(heap, key)) return property_key(runtime, key)
  return heap.handles.scope(() => {
    const converted = heap.handles.local()
    if (coerce_value(runtime, converted, key, "ToString") === THROW)
      return undefined
    return property_key(runtime, converted)
  })
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

// A stored property's address is valid only until the next heap allocation.
interface OwnProperty {
  flags: PropertyFlags
  property?: Address
  value?: string | number
}

/**
 * A virtual property represents a property that doesn't get stored directly as a separate
 * slot in the object's storage.
 * E.g. some_string[index]. It would be wasteful to store each index as a separate property,
 *      so they are computed from the underlying string bytes rather than stored.
 *
 * String or byte buffer indices are also computed from the underlying buffers.
 */
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
        flags: ENUMERABLE,
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
      return { flags: WRITABLE | ENUMERABLE, value: bytes[index] }
  }
}

function own_property(
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

function inherited_property(
  runtime: Runtime,
  object: Handle,
  name: PropertyKey,
): OwnProperty | undefined {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const current = heap.handles.local()
    heap.copy_value(current, object)
    while (true) {
      const property = own_property(runtime, current, name)
      if (property) return property
      const prototype = prototype_reference(runtime, current)
      if (!prototype) return undefined
      set_ref(heap, current, prototype)
    }
  })
}

function descriptor_of(
  runtime: Runtime,
  found: OwnProperty | undefined,
): PropertyDescriptor | undefined {
  if (!found) return undefined
  const { heap } = runtime
  const enumerable = Boolean(found.flags & ENUMERABLE),
    configurable = Boolean(found.flags & CONFIGURABLE)
  if (found.flags & ACCESSOR) {
    const get = heap.handles.local(),
      set = heap.handles.local()
    load_property_value(heap, get, found.property!)
    load_property_setter(heap, set, found.property!)
    return { kind: "accessor", get, set, enumerable, configurable }
  }
  const value = heap.handles.local()
  if (found.property) load_property_value(heap, value, found.property)
  else write_primitive(runtime, value, found.value)
  const writable = Boolean(found.flags & WRITABLE)
  return { kind: "data", value, writable, enumerable, configurable }
}

/** @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getownproperty-p */
export function get_own_property_descriptor(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  return descriptor_of(runtime, own_property(runtime, object, key))
}

/** The descriptor of the property `object` has or inherits. */
export function get_property_descriptor(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  return descriptor_of(runtime, inherited_property(runtime, object, key))
}

/** @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-get-p-receiver */
export function get_property_value(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: PropertyKey,
): Status {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const found = get_property_descriptor(runtime, object, key)
    if (found === undefined) write_undefined(heap, destination)
    else if (found.kind === "data") heap.copy_value(destination, found.value)
    else if (tag_of(heap, found.get) === VALUE_TAGS.UNDEFINED)
      write_undefined(heap, destination)
    else return call(runtime, destination, found.get, object, [])
    return OK
  })
}

export function has_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
) {
  return inherited_property(runtime, object, key) !== undefined
}

/** Returns false when the property is non-configurable. */
export function delete_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
) {
  if (virtual_property(runtime, object, key)) return false
  if (!has_property_list(runtime.heap, object)) return true
  return remove_property(runtime.heap, object, key)
}

export function define_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  value: Handle,
  flags: PropertyFlags = WRITABLE | ENUMERABLE | CONFIGURABLE,
  setter?: Handle,
) {
  if (!try_define_property(runtime, object, key, value, flags, setter))
    panic("Cannot redefine property")
}

/** Returns false when an existing non-configurable property forbids the change. */
export function try_define_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  value: Handle,
  flags: PropertyFlags = WRITABLE | ENUMERABLE | CONFIGURABLE,
  setter?: Handle,
) {
  const { heap } = runtime
  const virtual =
    flags & PRIVATE ? undefined : virtual_property(runtime, object, key)
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
  key: PropertyKey,
  value: Handle,
  flags: PropertyFlags = WRITABLE | ENUMERABLE | CONFIGURABLE,
  setter?: Handle,
) {
  const { heap } = runtime
  const property = find_property(
    heap,
    object,
    key,
    true,
    Boolean(flags & PRIVATE),
  )
  if (property !== 0) {
    const previous_flags = property_flags(heap, property)
    if (!(previous_flags & CONFIGURABLE)) {
      if (
        (flags & (ENUMERABLE | CONFIGURABLE | ACCESSOR)) !==
          (previous_flags & (ENUMERABLE | ACCESSOR)) ||
        (!(previous_flags & WRITABLE) && flags & WRITABLE)
      )
        return false
      if (previous_flags & ACCESSOR || !(previous_flags & WRITABLE)) {
        const same = heap.handles.scope(() => {
          const previous = heap.handles.local()
          if (flags & ACCESSOR && setter !== undefined)
            load_property_setter(heap, previous, property)
          else load_property_value(heap, previous, property)
          return same_value(runtime, previous, value)
        })
        if (!same) return false
      }
    }
    if (flags & ACCESSOR) {
      if (!(previous_flags & ACCESSOR)) {
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
    if (previous_flags & ACCESSOR) {
      heap.handles.scope(() => {
        const empty = heap.handles.local()
        store_property_setter(heap, property, empty)
      })
    }
    return true
  }
  return heap.handles.scope(() => {
    const stored = heap.handles.local()
    if (typeof key === "string") write_string(heap, stored, key)
    else heap.copy_value(stored, key)
    insert_property(
      heap,
      object,
      stored,
      flags,
      value,
      Boolean(flags & ACCESSOR && setter !== undefined),
    )
    return true
  })
}

/** @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-set-p-v-receiver */
export function set_property_value(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  value: Handle,
): Status {
  const { heap } = runtime
  if (heap_type_of(heap, object) === HEAP_TYPES.BYTE_BUFFER) {
    const name = typeof key === "string" ? key : "",
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
  if (
    heap_type_of(heap, object) === HEAP_TYPES.STRING ||
    virtual_property(runtime, object, key)
  )
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to readonly string property",
    )
  return heap.handles.scope(() => {
    const found = get_property_descriptor(runtime, object, key)
    if (found?.kind === "accessor") {
      if (tag_of(heap, found.set) === VALUE_TAGS.UNDEFINED)
        return throw_error(runtime, "TypeError", "Property has no setter")
      const result = heap.handles.local()
      return call(runtime, result, found.set, object, [value])
    }
    if (found && !found.writable)
      return throw_error(
        runtime,
        "TypeError",
        "Cannot assign to readonly property",
      )
    if (!has_property_list(heap, object))
      return throw_error(runtime, "TypeError", "Expected an object")
    const own = own_property(runtime, object, key)
    return define_value_property(
      runtime,
      object,
      key,
      value,
      own ? own.flags : WRITABLE | ENUMERABLE | CONFIGURABLE,
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
    define_property(
      runtime,
      object,
      key,
      value!,
      readonly ? PRIVATE : PRIVATE | WRITABLE,
    )
  } else {
    if (property === 0)
      return throw_error(runtime, "TypeError", "Invalid private field receiver")
    if (value === undefined) load_property_value(heap, destination, property)
    else {
      if (!(property_flags(heap, property) & WRITABLE))
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
    if (!(property_flags(heap, property) & PRIVATE)) {
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
    const value = heap.handles.local()
    create_array(runtime, destination, ordered.length + symbols.length)
    for (let index = 0; index < ordered.length; index++) {
      write_string(heap, value, ordered[index])
      ordinary_define_property(
        runtime,
        destination,
        String(index),
        value,
        WRITABLE | ENUMERABLE | CONFIGURABLE,
      )
    }
    for (let index = 0; index < symbols.length; index++) {
      ordinary_define_property(
        runtime,
        destination,
        String(ordered.length + index),
        symbols[index],
        WRITABLE | ENUMERABLE | CONFIGURABLE,
      )
    }
  })
}

/**
 * Writes `descriptor` as an object (`value`, `writable`, `get`, `set`,
 * `enumerable`, `configurable`), or `undefined`.
 * @see https://tc39.es/ecma262/#sec-frompropertydescriptor
 */
export function from_property_descriptor(
  runtime: Runtime,
  destination: Handle,
  descriptor: PropertyDescriptor | undefined,
) {
  const { heap } = runtime
  if (!descriptor) {
    write_undefined(heap, destination)
    return
  }
  heap.handles.scope(() => {
    const flag = heap.handles.local()
    create_object(runtime, destination)
    if (descriptor.kind === "data") {
      define_property(runtime, destination, "value", descriptor.value)
      write_boolean(heap, flag, descriptor.writable)
      define_property(runtime, destination, "writable", flag)
    } else {
      define_property(runtime, destination, "get", descriptor.get)
      define_property(runtime, destination, "set", descriptor.set)
    }
    for (const [field, present] of [
      ["enumerable", descriptor.enumerable],
      ["configurable", descriptor.configurable],
    ] as [string, boolean][]) {
      write_boolean(heap, flag, present)
      define_property(runtime, destination, field, flag)
    }
  })
}

// Descriptors from native operations are trusted records of data fields.
// Public Object APIs can perform observable descriptor conversion in the stdlib
// before calling us.
export function define_own_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
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
    const value = heap.handles.local(),
      getter = heap.handles.local(),
      setter = heap.handles.local()
    const previous = own_property(runtime, object, key)
    let flags = previous?.flags ?? 0
    if (flags & ACCESSOR) flags &= ~WRITABLE
    if (previous?.property) {
      load_property_value(heap, value, previous.property)
      if (flags & ACCESSOR) {
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
      const found = get_property_descriptor(runtime, descriptor, field_name)
      if (!found) return false
      if (found.kind === "accessor")
        return throw_error(
          runtime,
          "TypeError",
          "Native operation descriptor fields must be data properties",
        )
      heap.copy_value(target, found.value)
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
      if (!accessor && flags & ACCESSOR) {
        const current = own_property(runtime, object, key)
        load_property_value(heap, getter, current!.property!)
      }
      if (!(flags & ACCESSOR) && !has_setter) write_undefined(heap, setter)
      flags = (flags & ~WRITABLE) | ACCESSOR
    } else if (has_value || has_writable) {
      if (flags & ACCESSOR) {
        flags &= ~ACCESSOR
        if (!has_value) write_undefined(heap, value)
      }
      if (has_writable)
        flags = truthy(runtime, writable) ? flags | WRITABLE : flags & ~WRITABLE
    }
    for (const [field_name, mask] of [
      ["enumerable", ENUMERABLE],
      ["configurable", CONFIGURABLE],
    ] as [string, number][]) {
      const present = field(field_name, writable)
      if (present === THROW) return THROW
      if (present)
        flags = truthy(runtime, writable) ? flags | mask : flags & ~mask
    }
    if (flags & ACCESSOR) {
      // Validate a non-configurable accessor's two fields before changing either.
      const current = own_property(runtime, object, key)
      if (current && !(current.flags & CONFIGURABLE)) {
        if (flags !== (current.flags & ~WRITABLE))
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
      const property = own_property(runtime, object, key)!.property!
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
  key: PropertyKey,
  descriptor: Handle,
): Status {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const result = heap.handles.local(),
      key_value = heap.handles.local()
    if (typeof key === "string") write_string(heap, key_value, key)
    else heap.copy_value(key_value, key)
    if (
      call(runtime, result, method, object, [key_value, descriptor]) === THROW
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
  key: PropertyKey,
  descriptor: Handle,
): Status | null {
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined) return null
  return invoke_define(runtime, method, object, key, descriptor)
}

export function define_value_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  value: Handle,
  flags: number = WRITABLE | ENUMERABLE | CONFIGURABLE,
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
      field = heap.handles.local()
    create_object(runtime, descriptor)
    define_property(
      runtime,
      descriptor,
      flags & ACCESSOR ? (setter === undefined ? "get" : "set") : "value",
      value,
    )
    if (!value_only) {
      for (const [text, mask] of [
        ["writable", WRITABLE],
        ["enumerable", ENUMERABLE],
        ["configurable", CONFIGURABLE],
      ] as [string, number][]) {
        if (mask === WRITABLE && flags & ACCESSOR) continue
        write_boolean(heap, field, Boolean(flags & mask))
        define_property(runtime, descriptor, text, field)
      }
    }
    return invoke_define(runtime, method, object, key, descriptor)
  })
}
