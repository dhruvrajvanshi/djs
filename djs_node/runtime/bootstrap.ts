import type { Runtime } from "./runtime.ts"
import type { ModuleRecord } from "./modules.ts"
import { load_module, evaluate_realm_module, read_export } from "./modules.ts"
import { create_intrinsics, freeze_realm } from "../vm/realm.ts"

const REALM = new URL("../stdlib/ecma/initialize-realm.js", import.meta.url)
  .href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href

async function evaluate_stdlib(runtime: Runtime, path: string) {
  const module = await load_module(runtime, path)
  evaluate_realm_module(runtime, module)
  return module
}

function define_globals(runtime: Runtime, module: ModuleRecord) {
  for (const name of module.exports.keys()) {
    const value = runtime.heap.handles.persistent()
    read_export(runtime, module, name, value)
    runtime.realm.globals.set(name, value)
  }
}

/** Builds the realm, then the globals. See docs/bootstrap.md. */
export async function bootstrap(runtime: Runtime) {
  create_intrinsics(runtime)
  const realm = await evaluate_stdlib(runtime, REALM)
  freeze_realm(runtime)
  define_globals(runtime, realm)
  define_globals(runtime, await evaluate_stdlib(runtime, NODE_GLOBALS))
}
