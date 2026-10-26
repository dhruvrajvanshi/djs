import type { Root } from "../storage/value.ts"
import {
  kind_of,
  set_ref,
  write_boolean,
  write_null,
} from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import {
  has_property_list,
  mark_error_object,
  object_prototype_reference,
  try_set_prototype,
} from "../records/object.ts"
import {
  find_property,
  load_property_value,
  store_property_value,
} from "../records/property.ts"
import {
  string_object_set_value,
  string_value,
} from "../records/string_object.ts"
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
function slot_key(runtime: Runtime, name: string): Root {
  let key = runtime.realm.slot_keys.get(name)
  if (key === undefined) {
    key = runtime.memory.alloc_root()
    create_object(runtime, key)
    runtime.realm.slot_keys.set(name, key)
  }
  return key
}

/**
 * Creates a slot's key when its code is linked, so the realm's roots don't
 * grow while code runs.
 */
export function declare_slot(runtime: Runtime, name: string) {
  if (!VM_SLOTS.has(name)) slot_key(runtime, name)
}

export function has_slot(runtime: Runtime, object: Root, name: string) {
  const { memory } = runtime
  if (!has_property_list(memory, object)) return false
  switch (name) {
    case "[[Prototype]]":
    case "[[Extensible]]":
      return true
    case "[[StringData]]":
      return kind_of(memory, object) === KINDS.STRING_OBJECT
    case "[[ErrorData]]":
      return kind_of(memory, object) === KINDS.ERROR
  }
  return (
    find_property(memory, object, slot_key(runtime, name), true, true) !== 0
  )
}

export function get_slot(
  runtime: Runtime,
  destination: Root,
  object: Root,
  name: string,
): Status {
  const { memory } = runtime
  if (!has_slot(runtime, object, name))
    return throw_error(runtime, "TypeError", `Object has no ${name} slot`)
  switch (name) {
    case "[[Prototype]]": {
      const prototype = object_prototype_reference(memory, object)
      if (prototype) set_ref(memory, destination, prototype)
      else write_null(memory, destination)
      return OK
    }
    case "[[Extensible]]":
      write_boolean(memory, destination, true)
      return OK
    case "[[StringData]]":
      string_value(memory, destination, object)
      return OK
    case "[[ErrorData]]":
      write_null(memory, destination)
      return OK
  }
  const property = find_property(
    memory,
    object,
    slot_key(runtime, name),
    true,
    true,
  )
  load_property_value(memory, destination, property)
  return OK
}

export function set_slot(
  runtime: Runtime,
  object: Root,
  name: string,
  value: Root,
): Status {
  const { memory } = runtime
  if (VM_SLOTS.has(name))
    return throw_error(runtime, "TypeError", `Cannot set ${name}`)
  if (!has_slot(runtime, object, name))
    return throw_error(runtime, "TypeError", `Object has no ${name} slot`)
  const property = find_property(
    memory,
    object,
    slot_key(runtime, name),
    true,
    true,
  )
  store_property_value(memory, property, value)
  return OK
}

/** Gives a new object a slot, including the slots the VM represents itself. */
export function init_slot(
  runtime: Runtime,
  object: Root,
  name: string,
  value: Root,
): Status {
  const { memory } = runtime
  switch (name) {
    case "[[Prototype]]":
      if (!try_set_prototype(memory, object, value))
        return throw_error(runtime, "TypeError", "Cyclic prototype")
      return OK
    case "[[Extensible]]":
      return throw_error(runtime, "TypeError", `Cannot initialize ${name}`)
    case "[[StringData]]":
      if (kind_of(memory, object) !== KINDS.STRING_OBJECT)
        return throw_error(runtime, "TypeError", "Expected a String object")
      string_object_set_value(memory, object, value)
      return OK
    case "[[ErrorData]]":
      if (kind_of(memory, object) !== KINDS.OBJECT)
        return throw_error(runtime, "TypeError", "Expected an ordinary object")
      mark_error_object(memory, object)
      return OK
  }
  const key = slot_key(runtime, name)
  if (find_property(memory, object, key, true, true) !== 0)
    return throw_error(runtime, "TypeError", `Duplicate ${name} slot`)
  define_property(runtime, object, key, value, 9)
  return OK
}
