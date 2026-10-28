import { panic } from "../utils.ts"
import type { JSValue } from "./storage/heap.ts"
import { VALUE_TAGS, tag_of } from "./storage/value.ts"
import type { Runtime } from "../runtime/runtime.ts"
import {
  environment_scope_id,
  environment_slot_uninitialized,
  load_environment_slot,
  store_environment_slot,
} from "./heap_types/environment.ts"
import { OK, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

function scope_of(runtime: Runtime, environment: JSValue) {
  return runtime.loader.scopes[environment_scope_id(runtime.heap, environment)]
}

export function load_binding(
  runtime: Runtime,
  destination: JSValue,
  environment: JSValue,
  slot: number,
): Status {
  const { heap } = runtime
  const imported = scope_of(runtime, environment).import_bindings?.get(slot)
  if (imported)
    return load_binding(
      runtime,
      destination,
      runtime.loader.modules[imported.module_id].environment,
      imported.slot,
    )
  load_environment_slot(heap, destination, environment, slot)
  if (tag_of(heap, destination) === VALUE_TAGS.UNINITIALIZED)
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  return OK
}

export function initialize_binding(
  runtime: Runtime,
  environment: JSValue,
  slot: number,
  source: JSValue,
) {
  const { heap } = runtime
  const scope = scope_of(runtime, environment)
  if (scope.import_bindings?.has(slot))
    panic("Cannot initialize an imported binding")
  if (!environment_slot_uninitialized(heap, environment, slot))
    panic("Binding is already initialized")
  store_environment_slot(heap, environment, slot, source)
}

export function store_binding(
  runtime: Runtime,
  environment: JSValue,
  slot: number,
  source: JSValue,
): Status {
  const { heap } = runtime
  const scope = scope_of(runtime, environment)
  if (scope.import_bindings?.has(slot))
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to an imported binding",
    )
  if (environment_slot_uninitialized(heap, environment, slot))
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  if (scope.binding_flags[slot])
    return throw_error(runtime, "TypeError", "Assignment to constant binding")
  store_environment_slot(heap, environment, slot, source)
  return OK
}
