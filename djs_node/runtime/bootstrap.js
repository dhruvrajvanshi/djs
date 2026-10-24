import { alloc_root } from "../vm/memory.js"
import { load_module, evaluate_module, read_export } from "./modules.js"

export async function bootstrap(runtime) {
  for (const [name, identity] of [
    ["console", "node:console"],
    ["Promise", "djs:promise"],
  ]) {
    const module = await load_module(runtime, identity)
    await evaluate_module(runtime, module)
    const value = alloc_root(runtime.memory)
    read_export(runtime, module, "default", value)
    runtime.globals.set(name, value)
  }
}
