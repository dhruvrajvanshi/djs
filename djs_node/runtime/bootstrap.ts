import type { Runtime } from "./modules.ts"
import { alloc_root, free_root } from "../vm/memory.ts"
import {
  write_string,
  create_symbol,
  WELL_KNOWN_SYMBOLS,
} from "../vm/values.ts"
import {
  get_property,
  set_prototype,
  mark_error_object,
} from "../vm/objects.ts"
import { load_module, evaluate_module, read_export } from "./modules.ts"

const JS_GLOBALS = new URL("../stdlib/js/index.js", import.meta.url).href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href
const ABSTRACT = new URL("../stdlib/js/abstract.js", import.meta.url).href
const PROMISE = new URL("../stdlib/js/promise.js", import.meta.url).href

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
  const abstract = await load_module(runtime, ABSTRACT)
  await evaluate_module(runtime, abstract)
  runtime.coercions = new Map()
  for (const name of ["to_primitive", "to_string", "to_number"]) {
    const value = alloc_root(runtime.memory)
    read_export(runtime, abstract, name, value)
    runtime.coercions.set(name, value)
  }
  await define_globals(runtime, JS_GLOBALS)
  runtime.error_prototypes = new Map()
  const key = alloc_root(runtime.memory)
  try {
    write_string(runtime.memory, key, "prototype")
    for (const name of [
      "Error",
      "TypeError",
      "RangeError",
      "ReferenceError",
      "SyntaxError",
    ]) {
      const prototype = alloc_root(runtime.memory)
      get_property(runtime.memory, prototype, runtime.globals.get(name)!, key)
      runtime.error_prototypes.set(name, prototype)
      mark_error_object(runtime.memory, prototype)
      if (name === "Error")
        set_prototype(
          runtime.memory,
          prototype,
          runtime.memory.object_prototype!,
        )
      else
        set_prototype(
          runtime.memory,
          prototype,
          runtime.error_prototypes.get("Error")!,
        )
    }
  } finally {
    free_root(runtime.memory, key)
  }
  const promise = await load_module(runtime, PROMISE)
  runtime.promise_await = alloc_root(runtime.memory)
  read_export(runtime, promise, "await_promise", runtime.promise_await)
  runtime.promise_capability = alloc_root(runtime.memory)
  read_export(
    runtime,
    promise,
    "promise_capability",
    runtime.promise_capability,
  )
  await define_globals(runtime, NODE_GLOBALS)
}
