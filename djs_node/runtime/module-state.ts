import type { Brand } from "../utils.ts"
import type { Root } from "../vm/memory.ts"
import { read_root } from "../vm/memory.ts"

export const MODULE_STATE = Object.freeze({
  LINKING: 0,
  LINKED: 1,
  EVALUATING: 2,
  AWAITING: 3,
  EVALUATED: 4,
  ERRORED: 5,
})

export type ModuleStatus = (typeof MODULE_STATE)[keyof typeof MODULE_STATE]
export type ModuleStateBytes = Brand<Uint8Array, "ModuleStateBytes">

const M = Object.freeze({ STATUS: 0, ENVIRONMENT: 4, ERROR: 12 })

function state_view(state: ModuleStateBytes): DataView {
  return new DataView(state.buffer, state.byteOffset, state.byteLength)
}

// Four u32 words: status, environment root, reserved, error root.
export function create_module_state(
  environment: Root,
  error: Root,
): ModuleStateBytes {
  const state = new Uint8Array(16) as ModuleStateBytes
  const view = state_view(state)
  view.setUint32(M.ENVIRONMENT, environment, true)
  view.setUint32(M.ERROR, error, true)
  return state
}

export function module_state_environment_root(state: ModuleStateBytes): Root {
  return read_root(state_view(state), M.ENVIRONMENT)
}

export function module_state_error_root(state: ModuleStateBytes): Root {
  return read_root(state_view(state), M.ERROR)
}

export function module_state_status(state: ModuleStateBytes): ModuleStatus {
  return state_view(state).getUint32(M.STATUS, true) as ModuleStatus
}

export function module_state_set_status(
  state: ModuleStateBytes,
  status: ModuleStatus,
) {
  state_view(state).setUint32(M.STATUS, status, true)
}
