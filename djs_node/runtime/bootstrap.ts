import type { Runtime } from "./modules.ts"
import { alloc_root, free_root } from "../vm/memory.ts"
import {
  write_string,
  create_symbol,
  WELL_KNOWN_SYMBOLS,
} from "../vm/values.ts"
import { REALM_INTRINSICS } from "../vm/intrinsics.ts"
import {
  load_module,
  evaluate_module,
  read_export,
  link_realm_intrinsics,
} from "./modules.ts"

const INTRINSICS = new URL("../stdlib/js/intrinsics.js", import.meta.url).href
const REALM = new URL("../stdlib/js/realm.js", import.meta.url).href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href

async function define_globals(runtime: Runtime, identity: string) {
  const module = await load_module(runtime, identity)
  await evaluate_module(runtime, module)
  for (const name of module.exports.keys()) {
    const value = alloc_root(runtime.memory)
    read_export(runtime, module, name, value)
    runtime.globals.set(name, value)
  }
}

export async function bootstrap(runtime: Runtime) {
  runtime.well_known_symbols = new Map()
  const description = alloc_root(runtime.memory)
  try {
    for (const name of WELL_KNOWN_SYMBOLS) {
      const symbol = alloc_root(runtime.memory)
      write_string(runtime.memory, description, `Symbol.${name}`)
      create_symbol(runtime.memory, symbol, description)
      runtime.well_known_symbols.set(name, symbol)
    }
  } finally {
    free_root(runtime.memory, description)
  }
  runtime.property_names = new Map()
  for (const name of ["next", "done", "value", "return", "length"]) {
    const root = alloc_root(runtime.memory)
    write_string(runtime.memory, root, name)
    runtime.property_names.set(name, root)
  }
  // Marking happens before evaluation so each intrinsic reaches the VM as
  // soon as the stdlib initializes it.
  const intrinsics = await load_module(runtime, INTRINSICS)
  link_realm_intrinsics(runtime, intrinsics, REALM_INTRINSICS)
  await define_globals(runtime, REALM)
  await evaluate_module(runtime, intrinsics)
  await define_globals(runtime, NODE_GLOBALS)
}
