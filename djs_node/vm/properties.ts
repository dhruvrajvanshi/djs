import type { Address } from "./storage/value.ts"
import type { Handle } from "./storage/heap.ts"
import {
  VALUE_TAGS,
  get_ref,
  heap_type_of,
  read_number,
  set_ref,
  tag_of,
  write_boolean,
  write_undefined,
} from "./storage/value.ts"
import {
  HEAP_TYPES,
  PROPERTY_FLAGS,
  type PropertyFlags,
} from "./storage/layout.ts"
import type { Runtime } from "../runtime/runtime.ts"
import {
  heap_string_code_unit_at,
  heap_string_length,
  read_string,
  write_string,
} from "./heap_types/string.ts"
import { byte_buffer_view } from "./heap_types/byte_buffer.ts"
import { string_reference } from "./heap_types/string_object.ts"
import {
  allocate_object,
  has_property_list,
  is_object,
  object_properties,
  object_prototype_reference,
} from "./heap_types/object.ts"
import type { PropertyKey } from "./heap_types/property.ts"
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
} from "./heap_types/property.ts"
import { create_array, create_object } from "./objects.ts"
import { same_value, to_string, truthy, write_primitive } from "./operations.ts"
import { call, to_primitive } from "./calls.ts"
import { panic } from "../utils.ts"
import { OK, THROW, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

const { WRITABLE, ENUMERABLE, CONFIGURABLE, PRIVATE, ACCESSOR } = PROPERTY_FLAGS

export type { PropertyKey } from "./heap_types/property.ts"

/**
 * A property's attributes and contents, as handles in the caller's handle
 * scope. Any field may be absent: defining leaves an absent field as it is, or
 * as false or undefined on a new property. Descriptors read from a property
 * are complete.
 * @see https://tc39.es/ecma262/#sec-property-descriptor-specification-type
 */
export interface PropertyDescriptor {
  value?: Handle
  writable?: boolean
  get?: Handle
  set?: Handle
  enumerable?: boolean
  configurable?: boolean
}

/** @see https://tc39.es/ecma262/#sec-isaccessordescriptor */
export function is_accessor_descriptor(descriptor: PropertyDescriptor) {
  return descriptor.get !== undefined || descriptor.set !== undefined
}

/** @see https://tc39.es/ecma262/#sec-isdatadescriptor */
export function is_data_descriptor(descriptor: PropertyDescriptor) {
  return descriptor.value !== undefined || descriptor.writable !== undefined
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
    if (to_primitive(runtime, converted, key, "string") === THROW)
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
    return { get, set, enumerable, configurable }
  }
  const value = heap.handles.local()
  if (found.property) load_property_value(heap, value, found.property)
  else write_primitive(runtime, value, found.value)
  const writable = Boolean(found.flags & WRITABLE)
  return { value, writable, enumerable, configurable }
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
    else if (!is_accessor_descriptor(found))
      heap.copy_value(destination, found.value!)
    else if (tag_of(heap, found.get!) === VALUE_TAGS.UNDEFINED)
      write_undefined(heap, destination)
    else return call(runtime, destination, found.get!, object, [])
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

/**
 * Defines a property on an object the VM is setting up, where a refusal is a
 * VM bug. Skips exotic behavior, such as an array's `length` update.
 */
export function define_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
) {
  if (!ordinary_define_own_property(runtime, object, key, descriptor))
    panic("Cannot redefine property")
}

/**
 * Returns undefined after raising.
 * @see https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-defineownproperty-p-desc
 */
export function define_own_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): boolean | undefined {
  const method = exotic_define_own_property(runtime, object)
  if (method === undefined)
    return ordinary_define_own_property(runtime, object, key, descriptor)
  return invoke_define(runtime, method, object, key, descriptor)
}

/** @see https://tc39.es/ecma262/#sec-definepropertyorthrow */
export function define_property_or_throw(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): Status {
  const defined = define_own_property(runtime, object, key, descriptor)
  if (defined === undefined) return THROW
  if (!defined)
    return throw_error(runtime, "TypeError", "Cannot redefine property")
  return OK
}

/** @see https://tc39.es/ecma262/#sec-ordinarydefineownproperty */
export function ordinary_define_own_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): boolean {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const current = get_own_property_descriptor(runtime, object, key)
    // Computed properties, and objects without a property list, can't change:
    // a define can only restate them.
    if (
      virtual_property(runtime, object, key) ||
      !has_property_list(heap, object)
    )
      return (
        validate_and_apply_property_descriptor(
          runtime,
          undefined,
          key,
          false,
          descriptor,
          current,
        ) &&
        (descriptor.value === undefined ||
          same_value(runtime, descriptor.value, current!.value!))
      )
    return validate_and_apply_property_descriptor(
      runtime,
      object,
      key,
      true,
      descriptor,
      current,
    )
  })
}

/**
 * Checks `descriptor` against the `current` property, then applies it unless
 * `object` is undefined.
 * @see https://tc39.es/ecma262/#sec-validateandapplypropertydescriptor
 */
function validate_and_apply_property_descriptor(
  runtime: Runtime,
  object: Handle | undefined,
  key: PropertyKey,
  extensible: boolean,
  descriptor: PropertyDescriptor,
  current: PropertyDescriptor | undefined,
): boolean {
  if (current === undefined) {
    if (!extensible) return false
    if (object !== undefined)
      store_own_property(runtime, object, key, descriptor)
    return true
  }
  if (!current.configurable) {
    if (descriptor.configurable) return false
    if (
      descriptor.enumerable !== undefined &&
      descriptor.enumerable !== current.enumerable
    )
      return false
    const generic =
      !is_accessor_descriptor(descriptor) && !is_data_descriptor(descriptor)
    if (
      !generic &&
      is_accessor_descriptor(descriptor) !== is_accessor_descriptor(current)
    )
      return false
    if (is_accessor_descriptor(current)) {
      if (
        descriptor.get !== undefined &&
        !same_value(runtime, descriptor.get, current.get!)
      )
        return false
      if (
        descriptor.set !== undefined &&
        !same_value(runtime, descriptor.set, current.set!)
      )
        return false
    } else if (!current.writable) {
      if (descriptor.writable) return false
      if (
        descriptor.value !== undefined &&
        !same_value(runtime, descriptor.value, current.value!)
      )
        return false
    }
  }
  if (object === undefined) return true
  const enumerable = descriptor.enumerable ?? current.enumerable,
    configurable = descriptor.configurable ?? current.configurable
  let next: PropertyDescriptor
  if (is_data_descriptor(current) && is_accessor_descriptor(descriptor))
    next = {
      get: descriptor.get,
      set: descriptor.set,
      enumerable,
      configurable,
    }
  else if (is_accessor_descriptor(current) && is_data_descriptor(descriptor))
    next = {
      value: descriptor.value,
      writable: descriptor.writable,
      enumerable,
      configurable,
    }
  else if (is_accessor_descriptor(current))
    next = {
      get: descriptor.get ?? current.get,
      set: descriptor.set ?? current.set,
      enumerable,
      configurable,
    }
  else
    next = {
      value: descriptor.value ?? current.value,
      writable: descriptor.writable ?? current.writable,
      enumerable,
      configurable,
    }
  store_own_property(runtime, object, key, next)
  return true
}

/**
 * Writes `descriptor` as `key`'s own property, adding it if missing. Absent
 * fields are stored as false or undefined.
 */
function store_own_property(
  runtime: Runtime,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
) {
  const { heap } = runtime
  heap.handles.scope(() => {
    const stored_key = heap.handles.local(),
      empty = heap.handles.local()
    if (typeof key === "string") write_string(heap, stored_key, key)
    else heap.copy_value(stored_key, key)
    const accessor = is_accessor_descriptor(descriptor)
    const flags =
      (accessor ? ACCESSOR : descriptor.writable ? WRITABLE : 0) |
      (descriptor.enumerable ? ENUMERABLE : 0) |
      (descriptor.configurable ? CONFIGURABLE : 0)
    let property = find_property(heap, object, key, true)
    if (property === 0)
      property = insert_property(heap, object, stored_key, flags, empty)
    set_property_flags(heap, property, flags)
    if (accessor) {
      store_property_value(heap, property, descriptor.get ?? empty)
      store_property_setter(heap, property, descriptor.set ?? empty)
    } else {
      store_property_value(heap, property, descriptor.value ?? empty)
      store_property_setter(heap, property, empty)
    }
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
    if (found && is_accessor_descriptor(found)) {
      if (tag_of(heap, found.set!) === VALUE_TAGS.UNDEFINED)
        return throw_error(runtime, "TypeError", "Property has no setter")
      const result = heap.handles.local()
      return call(runtime, result, found.set!, object, [value])
    }
    if (found && !found.writable)
      return throw_error(
        runtime,
        "TypeError",
        "Cannot assign to readonly property",
      )
    if (!has_property_list(heap, object))
      return throw_error(runtime, "TypeError", "Expected an object")
    return define_property_or_throw(
      runtime,
      object,
      key,
      own_property(runtime, object, key)
        ? { value }
        : { value, writable: true, enumerable: true, configurable: true },
    )
  })
}

function find_private(runtime: Runtime, object: Handle, key: Handle) {
  if (!has_property_list(runtime.heap, object)) {
    throw_error(runtime, "TypeError", "Expected an object")
    return undefined
  }
  const property = find_property(runtime.heap, object, key, true, true)
  if (property === 0) {
    throw_error(runtime, "TypeError", "Invalid private field receiver")
    return undefined
  }
  return property
}

/** @see https://tc39.es/ecma262/#sec-privateget */
export function private_get(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: Handle,
): Status {
  const property = find_private(runtime, object, key)
  if (property === undefined) return THROW
  load_property_value(runtime.heap, destination, property)
  return OK
}

/** @see https://tc39.es/ecma262/#sec-privateset */
export function private_set(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
): Status {
  const property = find_private(runtime, object, key)
  if (property === undefined) return THROW
  if (!(property_flags(runtime.heap, property) & WRITABLE))
    return throw_error(runtime, "TypeError", "Private method is readonly")
  store_property_value(runtime.heap, property, value)
  return OK
}

function private_element_add(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
  flags: PropertyFlags,
): Status {
  const { heap } = runtime
  if (!has_property_list(heap, object))
    return throw_error(runtime, "TypeError", "Expected an object")
  if (find_property(heap, object, key, true, true) !== 0)
    return throw_error(
      runtime,
      "TypeError",
      "Private field is already initialized",
    )
  insert_property(heap, object, key, flags, value)
  return OK
}

/** @see https://tc39.es/ecma262/#sec-privatefieldadd */
export function private_field_add(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  value: Handle,
): Status {
  return private_element_add(runtime, object, key, value, PRIVATE | WRITABLE)
}

/** @see https://tc39.es/ecma262/#sec-privatemethodoraccessoradd */
export function private_method_or_accessor_add(
  runtime: Runtime,
  object: Handle,
  key: Handle,
  method: Handle,
): Status {
  return private_element_add(runtime, object, key, method, PRIVATE)
}

/** `#key in object` */
export function has_private(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  key: Handle,
): Status {
  const { heap } = runtime
  if (heap_type_of(heap, object) === HEAP_TYPES.BYTE_BUFFER) {
    write_boolean(heap, destination, false)
    return OK
  }
  if (!has_property_list(heap, object))
    return throw_error(
      runtime,
      "TypeError",
      "Private brand check requires an object",
    )
  write_boolean(
    heap,
    destination,
    find_property(heap, object, key, true, true) !== 0,
  )
  return OK
}

/**
 * Own string keys in property order, followed by symbol keys. The symbols are
 * local handles in the caller's scope, since creating the result moves them.
 */
export function own_property_keys(runtime: Runtime, object: Handle) {
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
      define_property(runtime, destination, String(index), {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
    for (let index = 0; index < symbols.length; index++) {
      define_property(runtime, destination, String(ordered.length + index), {
        value: symbols[index],
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  })
}

/**
 * Writes `descriptor` as an object with its present fields, or `undefined`.
 * @see https://tc39.es/ecma262/#sec-frompropertydescriptor
 */
export function from_property_descriptor(
  runtime: Runtime,
  destination: Handle,
  descriptor: PropertyDescriptor | undefined,
  // null for a descriptor only the stdlib sees, so that reading its absent
  // fields can't reach %Object.prototype%.
  prototype?: null,
) {
  const { heap } = runtime
  if (!descriptor) {
    write_undefined(heap, destination)
    return
  }
  heap.handles.scope(() => {
    if (prototype === null) allocate_object(heap, destination, undefined)
    else create_object(runtime, destination)
    for (const field of [
      "value",
      "writable",
      "get",
      "set",
      "enumerable",
      "configurable",
    ] as const) {
      const present = descriptor[field]
      if (present === undefined) continue
      let value
      if (typeof present === "boolean") {
        value = heap.handles.local()
        write_boolean(heap, value, present)
      } else value = present
      define_property(runtime, destination, field, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  })
}

/**
 * Reads a descriptor object's own fields, which must be data properties:
 * public Object APIs perform the observable conversion in the stdlib before
 * calling the VM. Returns undefined after raising.
 * @see https://tc39.es/ecma262/#sec-topropertydescriptor
 */
export function to_property_descriptor(
  runtime: Runtime,
  object: Handle,
): PropertyDescriptor | undefined {
  const { heap } = runtime
  if (!is_object(heap, object)) {
    throw_error(runtime, "TypeError", "Expected a property descriptor")
    return undefined
  }
  const descriptor: PropertyDescriptor = {}
  for (const field of [
    "enumerable",
    "configurable",
    "value",
    "writable",
    "get",
    "set",
  ] as const) {
    const found = get_own_property_descriptor(runtime, object, field)
    if (!found) continue
    if (is_accessor_descriptor(found)) {
      throw_error(
        runtime,
        "TypeError",
        "Native operation descriptor fields must be data properties",
      )
      return undefined
    }
    if (field === "value" || field === "get" || field === "set")
      descriptor[field] = found.value
    else descriptor[field] = truthy(runtime, found.value!)
  }
  for (const accessor of [descriptor.get, descriptor.set])
    if (
      accessor !== undefined &&
      tag_of(heap, accessor) !== VALUE_TAGS.UNDEFINED &&
      heap_type_of(heap, accessor) !== HEAP_TYPES.FUNCTION
    ) {
      throw_error(
        runtime,
        "TypeError",
        "Accessor must be callable or undefined",
      )
      return undefined
    }
  if (is_accessor_descriptor(descriptor) && is_data_descriptor(descriptor)) {
    throw_error(runtime, "TypeError", "Invalid mixed property descriptor")
    return undefined
  }
  return descriptor
}

// Returns undefined after raising.
function invoke_define(
  runtime: Runtime,
  method: Handle,
  object: Handle,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): boolean | undefined {
  const { heap } = runtime
  return heap.handles.scope(() => {
    const result = heap.handles.local(),
      key_value = heap.handles.local(),
      descriptor_object = heap.handles.local()
    if (typeof key === "string") write_string(heap, key_value, key)
    else heap.copy_value(key_value, key)
    from_property_descriptor(runtime, descriptor_object, descriptor, null)
    if (
      call(runtime, result, method, object, [key_value, descriptor_object]) ===
      THROW
    )
      return undefined
    if (tag_of(heap, result) !== VALUE_TAGS.BOOLEAN) {
      throw_error(
        runtime,
        "TypeError",
        "DefineOwnProperty must return a boolean",
      )
      return undefined
    }
    return truthy(runtime, result)
  })
}

// Array exotic objects define properties through the [[DefineOwnProperty]]
// the stdlib registers for "array"; other objects are ordinary.
function exotic_define_own_property(runtime: Runtime, object: Handle) {
  if (heap_type_of(runtime.heap, object) !== HEAP_TYPES.ARRAY) return undefined
  return runtime.realm.internal_method("array [[DefineOwnProperty]]")
}
