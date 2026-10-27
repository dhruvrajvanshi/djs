import type { Handle } from "../storage/heap.ts"
import {
  heap_type_of,
  set_ref,
  write_boolean,
  write_null,
} from "../storage/value.ts"
import { HEAP_TYPES } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import {
  has_property_list,
  mark_error_object,
  object_prototype_reference,
  try_set_prototype,
} from "../heap_types/object.ts"
import {
  find_property,
  load_property_value,
  store_property_value,
} from "../heap_types/property.ts"
import {
  string_object_set_value,
  string_value,
} from "../heap_types/string_object.ts"
import { create_object } from "./objects.ts"
import { define_property } from "./properties.ts"
import { OK, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

// The VM represents these slots itself; set_slot cannot change them.
const VM_SLOTS = new Set([
  "[[Prototype]]",
  "[[Extensible]]",
  "[[StringData]]",
  "[[ErrorData]]",
])

// Other slots are private properties, keyed by one token object per name.
function slot_key(runtime: Runtime, name: string): Handle {
  let key = runtime.realm.slot_keys.get(name)
  if (key === undefined) {
    key = runtime.heap.handles.persistent()
    create_object(runtime, key)
    runtime.realm.slot_keys.set(name, key)
  }
  return key
}

/**
 * Creates a slot's key when its code is linked, so the realm's handles don't
 * grow while code runs.
 */
export function declare_slot(runtime: Runtime, name: string) {
  if (!VM_SLOTS.has(name)) slot_key(runtime, name)
}

export function has_slot(runtime: Runtime, object: Handle, name: string) {
  const { heap } = runtime
  if (!has_property_list(heap, object)) return false
  switch (name) {
    case "[[Prototype]]":
    case "[[Extensible]]":
      return true
    case "[[StringData]]":
      return heap_type_of(heap, object) === HEAP_TYPES.STRING_OBJECT
    case "[[ErrorData]]":
      return heap_type_of(heap, object) === HEAP_TYPES.ERROR
  }
  return find_property(heap, object, slot_key(runtime, name), true, true) !== 0
}

export function get_slot(
  runtime: Runtime,
  destination: Handle,
  object: Handle,
  name: string,
): Status {
  const { heap } = runtime
  if (!has_slot(runtime, object, name))
    return throw_error(runtime, "TypeError", `Object has no ${name} slot`)
  switch (name) {
    case "[[Prototype]]": {
      const prototype = object_prototype_reference(heap, object)
      if (prototype) set_ref(heap, destination, prototype)
      else write_null(heap, destination)
      return OK
    }
    case "[[Extensible]]":
      write_boolean(heap, destination, true)
      return OK
    case "[[StringData]]":
      string_value(heap, destination, object)
      return OK
    case "[[ErrorData]]":
      write_null(heap, destination)
      return OK
  }
  const property = find_property(
    heap,
    object,
    slot_key(runtime, name),
    true,
    true,
  )
  load_property_value(heap, destination, property)
  return OK
}

export function set_slot(
  runtime: Runtime,
  object: Handle,
  name: string,
  value: Handle,
): Status {
  const { heap } = runtime
  if (VM_SLOTS.has(name))
    return throw_error(runtime, "TypeError", `Cannot set ${name}`)
  if (!has_slot(runtime, object, name))
    return throw_error(runtime, "TypeError", `Object has no ${name} slot`)
  const property = find_property(
    heap,
    object,
    slot_key(runtime, name),
    true,
    true,
  )
  store_property_value(heap, property, value)
  return OK
}

/** Gives a new object a slot, including the slots the VM represents itself. */
export function init_slot(
  runtime: Runtime,
  object: Handle,
  name: string,
  value: Handle,
): Status {
  const { heap } = runtime
  switch (name) {
    case "[[Prototype]]":
      if (!try_set_prototype(heap, object, value))
        return throw_error(runtime, "TypeError", "Cyclic prototype")
      return OK
    case "[[Extensible]]":
      return throw_error(runtime, "TypeError", `Cannot initialize ${name}`)
    case "[[StringData]]":
      if (heap_type_of(heap, object) !== HEAP_TYPES.STRING_OBJECT)
        return throw_error(runtime, "TypeError", "Expected a String object")
      string_object_set_value(heap, object, value)
      return OK
    case "[[ErrorData]]":
      if (heap_type_of(heap, object) !== HEAP_TYPES.OBJECT)
        return throw_error(runtime, "TypeError", "Expected an ordinary object")
      mark_error_object(heap, object)
      return OK
  }
  const key = slot_key(runtime, name)
  if (find_property(heap, object, key, true, true) !== 0)
    return throw_error(runtime, "TypeError", `Duplicate ${name} slot`)
  define_property(runtime, object, key, value, 9)
  return OK
}
