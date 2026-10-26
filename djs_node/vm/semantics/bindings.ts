import { panic } from "../../utils.ts"
import type { Root } from "../storage/value.ts"
import { TAGS, tag_of } from "../storage/value.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import {
  environment_scope_id,
  environment_slot_uninitialized,
  load_environment_slot,
  store_environment_slot,
} from "../records/environment.ts"
import { set_realm_intrinsic } from "../../runtime/realm.ts"
import { OK, throw_error } from "./errors.ts"
import type { Status } from "./errors.ts"

function scope_of(runtime: Runtime, environment: Root) {
  return runtime.loader.scopes[
    environment_scope_id(runtime.memory, environment)
  ]
}

export function load_binding(
  runtime: Runtime,
  destination: Root,
  environment: Root,
  slot: number,
): Status {
  const { memory } = runtime
  const imported = scope_of(runtime, environment).import_bindings?.get(slot)
  if (imported)
    return load_binding(
      runtime,
      destination,
      runtime.loader.modules[imported.module_id].environment,
      imported.slot,
    )
  load_environment_slot(memory, destination, environment, slot)
  if (tag_of(memory, destination) === TAGS.UNINITIALIZED)
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  return OK
}

export function initialize_binding(
  runtime: Runtime,
  environment: Root,
  slot: number,
  source: Root,
) {
  const { memory } = runtime
  const scope = scope_of(runtime, environment)
  if (scope.import_bindings?.has(slot))
    panic("Cannot initialize an imported binding")
  if (!environment_slot_uninitialized(memory, environment, slot))
    panic("Binding is already initialized")
  store_environment_slot(memory, environment, slot, source)
  const intrinsic = scope.intrinsic_bindings?.get(slot)
  if (intrinsic !== undefined) set_realm_intrinsic(runtime, intrinsic, source)
}

export function store_binding(
  runtime: Runtime,
  environment: Root,
  slot: number,
  source: Root,
): Status {
  const { memory } = runtime
  const scope = scope_of(runtime, environment)
  if (scope.import_bindings?.has(slot))
    return throw_error(
      runtime,
      "TypeError",
      "Cannot assign to an imported binding",
    )
  if (environment_slot_uninitialized(memory, environment, slot))
    return throw_error(
      runtime,
      "ReferenceError",
      "Cannot access binding before initialization",
    )
  if (scope.binding_flags[slot])
    return throw_error(runtime, "TypeError", "Assignment to constant binding")
  store_environment_slot(memory, environment, slot, source)
  return OK
}
