import { alloc_root, free_root, write_u32, KINDS } from "../vm/memory.js"
import { write_string, get_ref } from "../vm/values.js"
import { get_property, set_prototype } from "../vm/objects.js"
import { load_module, evaluate_module, read_export } from "./modules.js"

export async function bootstrap(runtime) {
  const errors = await load_module(runtime, "djs:errors")
  await evaluate_module(runtime, errors)
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
      const value = alloc_root(runtime.memory),
        prototype = alloc_root(runtime.memory)
      read_export(runtime, errors, name, value)
      runtime.globals.set(name, value)
      get_property(runtime.memory, prototype, value, key)
      runtime.error_prototypes.set(name, prototype)
      write_u32(runtime.memory, get_ref(runtime.memory, prototype), KINDS.ERROR)
      if (name !== "Error")
        set_prototype(
          runtime.memory,
          prototype,
          runtime.error_prototypes.get("Error"),
        )
    }
  } finally {
    free_root(runtime.memory, key)
  }
  for (const [name, identity] of [
    ["console", "node:console"],
    ["Promise", "djs:promise"],
  ]) {
    const module = await load_module(runtime, identity)
    await evaluate_module(runtime, module)
    const value = alloc_root(runtime.memory)
    read_export(runtime, module, "default", value)
    runtime.globals.set(name, value)
    if (name === "Promise") {
      runtime.promise_await = alloc_root(runtime.memory)
      read_export(runtime, module, "await_promise", runtime.promise_await)
    }
  }
}
