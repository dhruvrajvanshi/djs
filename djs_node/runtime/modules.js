import { resolve, isAbsolute } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile_module } from "../compiler/compile.js"
import { create_memory, alloc_root, copy_value } from "../vm/memory.js"
import {
  write_number,
  write_null,
  write_boolean,
  write_string,
  write_undefined,
} from "../vm/values.js"
import { create_environment, load_binding } from "../vm/objects.js"
import {
  create_context,
  evaluate_context,
  dispose_context,
  context_error,
} from "../vm/interpreter.js"
import { create_scheduler } from "./jobs.js"
import { create_node_host } from "../host/node.js"

export const MODULE_STATE = Object.freeze({
  LINKING: 0,
  LINKED: 1,
  EVALUATING: 2,
  AWAITING: 3,
  EVALUATED: 4,
  ERRORED: 5,
})
const BUILTINS = new Map([
  ["node:console", new URL("../stdlib/node/console.js", import.meta.url)],
  [
    "node:fs/promises",
    new URL("../stdlib/node/fs/promises.js", import.meta.url),
  ],
  ["djs:errors", new URL("../js/errors.js", import.meta.url)],
  ["djs:promise", new URL("../js/promise.js", import.meta.url)],
])

export function create_runtime({
  host = create_node_host(),
  max_steps = 1000000,
  ...memory_options
} = {}) {
  const runtime = {
    memory: create_memory(memory_options),
    host,
    max_steps,
    code: [],
    scopes: [],
    modules: [],
    identities: new Map(),
    globals: new Map(),
    contexts: [],
    scheduler: create_scheduler(),
  }
  for (const [name, value] of [
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ]) {
    const root = alloc_root(runtime.memory)
    if (value === undefined) write_undefined(runtime.memory, root)
    else write_number(runtime.memory, root, value)
    runtime.globals.set(name, root)
  }
  return runtime
}

function state_view(module) {
  return new DataView(module.state.buffer)
}
export function module_status(module) {
  return state_view(module).getUint32(0, true)
}
export function set_module_status(module, status) {
  state_view(module).setUint32(0, status, true)
}

function link_code(runtime, unit) {
  const constants = []
  for (const literal of unit.literals) {
    const root = alloc_root(runtime.memory)
    if (typeof literal === "string") write_string(runtime.memory, root, literal)
    else if (typeof literal === "number")
      write_number(runtime.memory, root, literal)
    else if (typeof literal === "boolean")
      write_boolean(runtime.memory, root, literal)
    else if (literal === null) write_null(runtime.memory, root)
    constants.push(root)
  }
  const scope_ids = unit.functions.map((fn) => {
    const id = runtime.scopes.length
    runtime.scopes.push({
      binding_flags: fn.binding_flags,
      import_bindings: new Map(),
    })
    return id
  })
  const id = runtime.code.length
  runtime.code.push({
    unit,
    constants,
    scope_ids,
    bytecodes: unit.functions.map((fn) => fn.bytecode),
  })
  return id
}

export function resolve_specifier(specifier, importer) {
  if (specifier.startsWith("node:")) {
    if (!BUILTINS.has(specifier))
      throw new SyntaxError(`Unsupported builtin module: ${specifier}`)
    return specifier
  }
  if (specifier.startsWith("file:")) return new URL(specifier).href
  if (isAbsolute(specifier)) return pathToFileURL(specifier).href
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!importer.startsWith("file:"))
      throw new SyntaxError("Relative imports require a file module")
    return new URL(specifier, importer).href
  }
  throw new SyntaxError(`Package imports are not implemented: ${specifier}`)
}

export async function load_module(runtime, identity) {
  const cached = runtime.identities.get(identity)
  if (cached !== undefined) return runtime.modules[cached]
  const builtin = BUILTINS.get(identity)
  const path = fileURLToPath(builtin ?? new URL(identity))
  const source = await runtime.host.read_text(path, "utf8")
  const unit = compile_module(source, path, {
    allow_intrinsics: Boolean(builtin),
  })
  const code_id = link_code(runtime, unit)
  const state = new Uint8Array(16)
  const module = {
    id: runtime.modules.length,
    identity,
    unit,
    code_id,
    state,
    dependencies: [],
    exports: new Map(unit.exports.map((item) => [item.name, item.slot])),
    get environment() {
      return state_view(module).getUint32(4, true)
    },
    get error() {
      return state_view(module).getUint32(12, true)
    },
  }
  for (const offset of [4, 12])
    state_view(module).setUint32(offset, alloc_root(runtime.memory), true)
  const fn = unit.functions[unit.entry]
  create_environment(
    runtime.memory,
    module.environment,
    undefined,
    fn.binding_count,
    runtime.code[code_id].scope_ids[unit.entry],
  )
  runtime.modules.push(module)
  runtime.identities.set(identity, module.id)
  const imports =
    runtime.scopes[runtime.code[code_id].scope_ids[unit.entry]].import_bindings
  try {
    for (const declaration of unit.imports) {
      const target = await load_module(
        runtime,
        resolve_specifier(
          declaration.specifier,
          builtin ? builtin.href : identity,
        ),
      )
      module.dependencies.push(target.id)
      for (const binding of declaration.bindings) {
        const slot = target.exports.get(binding.imported)
        if (slot === undefined)
          throw new SyntaxError(
            `${declaration.specifier} does not export ${binding.imported}`,
          )
        imports.set(binding.slot, Object.freeze({ module_id: target.id, slot }))
      }
    }
    set_module_status(module, MODULE_STATE.LINKED)
    return module
  } catch (error) {
    set_module_status(module, MODULE_STATE.ERRORED)
    write_string(runtime.memory, module.error, error.message)
    throw error
  }
}

export async function evaluate_module(runtime, module, ancestors = new Set()) {
  if (module_status(module) === MODULE_STATE.EVALUATED) return module
  if (module_status(module) === MODULE_STATE.ERRORED)
    throw new Error(`Module evaluation failed: ${module.identity}`)
  if (ancestors.has(module.id))
    throw new SyntaxError("Cyclic module evaluation is not implemented yet")
  const chain = new Set(ancestors).add(module.id)
  let context
  try {
    set_module_status(module, MODULE_STATE.EVALUATING)
    for (const id of module.dependencies)
      await evaluate_module(runtime, runtime.modules[id], chain)
    context = create_context(runtime, module.code_id, module.environment)
    context.module_state = module.state
    await evaluate_context(runtime, context)
    set_module_status(module, MODULE_STATE.EVALUATED)
    // Module evaluation fulfills with undefined; exports live in its environment.
    write_undefined(runtime.memory, module.error)
    return module
  } catch (error) {
    set_module_status(module, MODULE_STATE.ERRORED)
    if (context)
      copy_value(runtime.memory, module.error, context_error(context))
    else write_string(runtime.memory, module.error, error.message)
    throw error
  } finally {
    if (context) dispose_context(runtime, context)
  }
}

export function read_export(runtime, module, name, destination) {
  const slot = module.exports.get(name)
  if (slot === undefined) throw new SyntaxError(`Missing export: ${name}`)
  load_binding(runtime, destination, module.environment, slot)
}

export async function run_module(runtime, path) {
  const identity =
    path instanceof URL ? path.href : pathToFileURL(resolve(path)).href
  const module = await load_module(runtime, identity)
  return evaluate_module(runtime, module)
}
