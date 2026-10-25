import type { Root } from "./memory.ts"
import type { Runtime } from "../runtime/modules.ts"
import { KINDS, alloc_root } from "./memory.ts"
import { set_ref, write_boolean, write_null } from "./values.ts"
import {
  kind_of,
  create_object,
  has_property_list,
  find_property,
  define_property,
  try_set_prototype,
  mark_error_object,
  string_object_set_value,
  string_value,
  object_prototype_reference,
} from "./objects.ts"
import { copy_heap_value_to_root, copy_root_to_heap_value } from "./memory.ts"
import { OK, throw_error } from "./completion.ts"
import type { Status } from "./completion.ts"

// The VM represents these slots itself; set_slot cannot change them.
const VM_SLOTS = new Set([
  "[[Prototype]]",
  "[[Extensible]]",
  "[[StringData]]",
  "[[ErrorData]]",
])

// Other slots are private properties, keyed by one token object per name.
function slot_key(runtime: Runtime, name: string): Root {
  let key = runtime.slot_keys.get(name)
  if (key === undefined) {
    key = alloc_root(runtime.memory)
    create_object(runtime.memory, key)
    runtime.slot_keys.set(name, key)
  }
  return key
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
  copy_heap_value_to_root(memory, destination, property + 24)
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
  copy_root_to_heap_value(memory, property + 24, value)
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
  define_property(memory, object, key, value, 9)
  return OK
}
