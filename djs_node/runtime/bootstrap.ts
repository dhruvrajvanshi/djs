import type { Runtime } from "./modules.ts"
import {
  write_string,
  create_symbol,
  WELL_KNOWN_SYMBOLS,
} from "../vm/values.ts"
import { load_module, evaluate_module, read_export } from "./modules.ts"
import { create_realm } from "./realm.ts"

const REALM = new URL("../stdlib/js/realm.js", import.meta.url).href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href

async function define_globals(runtime: Runtime, identity: string) {
  const module = await load_module(runtime, identity)
  await evaluate_module(runtime, module)
  for (const name of module.exports.keys()) {
    const value = runtime.memory.alloc_root()
    read_export(runtime, module, name, value)
    runtime.globals.set(name, value)
  }
}

export async function bootstrap(runtime: Runtime) {
  runtime.well_known_symbols = new Map()
  const description = runtime.memory.alloc_root()
  try {
    for (const name of WELL_KNOWN_SYMBOLS) {
      const symbol = runtime.memory.alloc_root()
      write_string(runtime.memory, description, `Symbol.${name}`)
      create_symbol(runtime.memory, symbol, description)
      runtime.well_known_symbols.set(name, symbol)
    }
  } finally {
    runtime.memory.free_root(description)
  }
  runtime.property_names = new Map()
  for (const name of ["next", "done", "value", "return", "length"]) {
    const root = runtime.memory.alloc_root()
    write_string(runtime.memory, root, name)
    runtime.property_names.set(name, root)
  }
  // Linking the stdlib exposes its declarations; the realm is created from
  // them before any stdlib code runs.
  await load_module(runtime, REALM)
  create_realm(runtime)
  await define_globals(runtime, REALM)
  await define_globals(runtime, NODE_GLOBALS)
}
