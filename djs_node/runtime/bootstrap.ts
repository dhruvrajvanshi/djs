import type { Runtime } from "./runtime.ts"
import { load_module, evaluate_realm_module, read_export } from "./modules.ts"
import { create_realm, create_well_known_values } from "./realm.ts"

const REALM = new URL("../stdlib/js/realm.js", import.meta.url).href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href

async function define_globals(runtime: Runtime, identity: string) {
  const module = await load_module(runtime, identity)
  evaluate_realm_module(runtime, module)
  for (const name of module.exports.keys()) {
    const value = runtime.memory.alloc_root()
    read_export(runtime, module, name, value)
    runtime.realm.globals.set(name, value)
  }
}

export async function bootstrap(runtime: Runtime) {
  create_well_known_values(runtime)
  // Linking the stdlib exposes its declarations; the realm is created from
  // them before any stdlib code runs.
  await load_module(runtime, REALM)
  create_realm(runtime)
  await define_globals(runtime, REALM)
  await define_globals(runtime, NODE_GLOBALS)
}
