import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { Address, Handle } from "../storage/value.ts"
import {
  VALUE_TAGS,
  VALUE_BYTES,
  get_ref,
  heap_type_of,
  set_ref,
  tag_of,
  write_uninitialized,
} from "../storage/value.ts"
import { ENVIRONMENT, HEAP_TYPES } from "../storage/layout.ts"

export function create_environment(
  heap: Heap,
  destination: Handle,
  parent: Handle | undefined,
  binding_count: number,
  scope_id: number,
) {
  const reference = heap.allocate(
    HEAP_TYPES.ENVIRONMENT,
    16 + binding_count * VALUE_BYTES,
  )
  set_ref(heap, destination, reference)
  if (parent !== undefined)
    heap.store_value(reference + ENVIRONMENT.PARENT, parent)
  heap.write_u32(reference + ENVIRONMENT.COUNT, binding_count)
  heap.write_u32(reference + ENVIRONMENT.SCOPE, scope_id)
  heap.handles.scope(() => {
    const temporary = heap.handles.local()
    write_uninitialized(heap, temporary)
    for (let slot = 0; slot < binding_count; slot++)
      heap.store_value(slot_offset(reference, slot), temporary)
  })
}

function slot_offset(reference: Address, slot: number) {
  return reference + ENVIRONMENT.VALUES + slot * VALUE_BYTES
}

export function copy_environment_bindings(
  heap: Heap,
  destination: Handle,
  source: Handle,
) {
  const count = environment_binding_count(heap, source)
  heap.handles.scope(() => {
    const temporary = heap.handles.local()
    for (let slot = 0; slot < count; slot++) {
      load_environment_slot(heap, temporary, source, slot)
      store_environment_slot(heap, destination, slot, temporary)
    }
  })
}

export function environment_at(
  heap: Heap,
  destination: Handle,
  environment: Handle,
  depth: number,
) {
  heap.copy_value(destination, environment)
  for (let index = 0; index < depth; index++) {
    heap.load_value(
      destination,
      get_ref(heap, destination) + ENVIRONMENT.PARENT,
    )
  }
  if (heap_type_of(heap, destination) !== HEAP_TYPES.ENVIRONMENT)
    panic("Invalid lexical environment")
}

export function environment_binding_count(heap: Heap, environment: Handle) {
  return heap.read_u32(get_ref(heap, environment) + ENVIRONMENT.COUNT)
}

export function environment_scope_id(heap: Heap, environment: Handle) {
  return heap.read_u32(get_ref(heap, environment) + ENVIRONMENT.SCOPE)
}

function checked_slot_offset(heap: Heap, environment: Handle, slot: number) {
  if (slot >= environment_binding_count(heap, environment))
    panic("Invalid binding slot")
  return slot_offset(get_ref(heap, environment), slot)
}

export function load_environment_slot(
  heap: Heap,
  destination: Handle,
  environment: Handle,
  slot: number,
) {
  heap.load_value(destination, checked_slot_offset(heap, environment, slot))
}

export function store_environment_slot(
  heap: Heap,
  environment: Handle,
  slot: number,
  value: Handle,
) {
  heap.store_value(checked_slot_offset(heap, environment, slot), value)
}

export function environment_slot_uninitialized(
  heap: Heap,
  environment: Handle,
  slot: number,
) {
  return heap.handles.scope(() => {
    const previous = heap.handles.local()
    load_environment_slot(heap, previous, environment, slot)
    return tag_of(heap, previous) === VALUE_TAGS.UNINITIALIZED
  })
}
