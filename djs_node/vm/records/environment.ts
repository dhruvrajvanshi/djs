import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { HeapRef, Root } from "../storage/value.ts"
import {
  TAGS,
  VALUE_BYTES,
  get_ref,
  kind_of,
  set_ref,
  tag_of,
  write_uninitialized,
} from "../storage/value.ts"
import { ENVIRONMENT, KINDS } from "../storage/layout.ts"

export function create_environment(
  memory: Memory,
  destination: Root,
  parent: Root | undefined,
  binding_count: number,
  scope_id: number,
) {
  const reference = memory.allocate(
    KINDS.ENVIRONMENT,
    16 + binding_count * VALUE_BYTES,
  )
  set_ref(memory, destination, reference)
  if (parent !== undefined)
    memory.copy_root_to_heap_value(reference + ENVIRONMENT.PARENT, parent)
  memory.write_u32(reference + ENVIRONMENT.COUNT, binding_count)
  memory.write_u32(reference + ENVIRONMENT.SCOPE, scope_id)
  const temporary = memory.alloc_root()
  try {
    write_uninitialized(memory, temporary)
    for (let slot = 0; slot < binding_count; slot++)
      memory.copy_root_to_heap_value(slot_offset(reference, slot), temporary)
  } finally {
    memory.free_root(temporary)
  }
}

function slot_offset(reference: HeapRef, slot: number) {
  return reference + ENVIRONMENT.VALUES + slot * VALUE_BYTES
}

export function copy_environment_bindings(
  memory: Memory,
  destination: Root,
  source: Root,
) {
  const count = environment_binding_count(memory, source)
  const temporary = memory.alloc_root()
  try {
    for (let slot = 0; slot < count; slot++) {
      load_environment_slot(memory, temporary, source, slot)
      store_environment_slot(memory, destination, slot, temporary)
    }
  } finally {
    memory.free_root(temporary)
  }
}

export function environment_at(
  memory: Memory,
  destination: Root,
  environment: Root,
  depth: number,
) {
  memory.copy_value(destination, environment)
  for (let index = 0; index < depth; index++) {
    memory.copy_heap_value_to_root(
      destination,
      get_ref(memory, destination) + ENVIRONMENT.PARENT,
    )
  }
  if (kind_of(memory, destination) !== KINDS.ENVIRONMENT)
    panic("Invalid lexical environment")
}

export function environment_binding_count(memory: Memory, environment: Root) {
  return memory.read_u32(get_ref(memory, environment) + ENVIRONMENT.COUNT)
}

export function environment_scope_id(memory: Memory, environment: Root) {
  return memory.read_u32(get_ref(memory, environment) + ENVIRONMENT.SCOPE)
}

function checked_slot_offset(memory: Memory, environment: Root, slot: number) {
  if (slot >= environment_binding_count(memory, environment))
    panic("Invalid binding slot")
  return slot_offset(get_ref(memory, environment), slot)
}

export function load_environment_slot(
  memory: Memory,
  destination: Root,
  environment: Root,
  slot: number,
) {
  memory.copy_heap_value_to_root(
    destination,
    checked_slot_offset(memory, environment, slot),
  )
}

export function store_environment_slot(
  memory: Memory,
  environment: Root,
  slot: number,
  value: Root,
) {
  memory.copy_root_to_heap_value(
    checked_slot_offset(memory, environment, slot),
    value,
  )
}

export function environment_slot_uninitialized(
  memory: Memory,
  environment: Root,
  slot: number,
) {
  const previous = memory.alloc_root()
  try {
    load_environment_slot(memory, previous, environment, slot)
    return tag_of(memory, previous) === TAGS.UNINITIALIZED
  } finally {
    memory.free_root(previous)
  }
}
