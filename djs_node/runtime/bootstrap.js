import { alloc_root, free_root, write_u32, KINDS } from "../vm/memory.js"
import { write_string, get_ref } from "../vm/values.js"
import { get_property, set_prototype } from "../vm/objects.js"
import { load_module, evaluate_module, read_export } from "./modules.js"

const JS_GLOBALS = new URL("../stdlib/js/index.js", import.meta.url).href
const NODE_GLOBALS = new URL("../stdlib/node/index.js", import.meta.url).href
const ABSTRACT = new URL("../stdlib/js/abstract.js", import.meta.url).href
const PROMISE = new URL("../stdlib/js/promise.js", import.meta.url).href

async function define_globals(runtime, identity) {
  const module = await load_module(runtime, identity)
  await evaluate_module(runtime, module)
  for (const name of module.exports.keys()) {
    const value = alloc_root(runtime.memory)
    read_export(runtime, module, name, value)
    runtime.globals.set(name, value)
  }
}

export async function bootstrap(runtime) {
  await define_globals(runtime, JS_GLOBALS)
  const abstract = await load_module(runtime, ABSTRACT)
  runtime.coercions = new Map()
  for (const name of ["to_primitive", "to_string", "to_number"]) {
    const value = alloc_root(runtime.memory)
    read_export(runtime, abstract, name, value)
    runtime.coercions.set(name, value)
  }
  runtime.memory.object_prototype = alloc_root(runtime.memory)
  read_export(
    runtime,
    abstract,
    "object_prototype",
    runtime.memory.object_prototype,
  )
  runtime.error_prototypes = new Map()
  const key = alloc_root(runtime.memory)
  try {
    write_string(runtime.memory, key, "prototype")
    for (const name of ["String", "Array"]) {
      const field = name === "String" ? "string_prototype" : "array_prototype"
      const prototype = runtime.memory[field] ?? alloc_root(runtime.memory)
      get_property(runtime.memory, prototype, runtime.globals.get(name), key)
      runtime.memory[field] = prototype
    }
    for (const name of [
      "Error",
      "TypeError",
      "RangeError",
      "ReferenceError",
      "SyntaxError",
    ]) {
      const prototype = alloc_root(runtime.memory)
      get_property(runtime.memory, prototype, runtime.globals.get(name), key)
      runtime.error_prototypes.set(name, prototype)
      write_u32(runtime.memory, get_ref(runtime.memory, prototype), KINDS.ERROR)
      if (name === "Error")
        set_prototype(
          runtime.memory,
          prototype,
          runtime.memory.object_prototype,
        )
      else
        set_prototype(
          runtime.memory,
          prototype,
          runtime.error_prototypes.get("Error"),
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
