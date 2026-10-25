import type { Brand } from "../utils.ts"
import type { Root, MemoryOptions, Memory } from "../vm/memory.ts"
import type { ExportBinding, CompiledModule } from "../compiler/compile.ts"
import type { Context } from "../vm/context.ts"
import { context_error } from "../vm/context.ts"
import type { NodeHost } from "../host/node.ts"
import type { Scheduler } from "./scheduler.ts"
import { resolve, isAbsolute } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile_module } from "../compiler/compile.ts"
import {
  create_memory,
  alloc_root,
  free_root,
  copy_value,
} from "../vm/memory.ts"
import {
  write_number,
  write_null,
  write_boolean,
  write_string,
  write_undefined,
} from "../vm/values.ts"
import {
  create_environment,
  create_function,
  load_binding,
  store_binding,
} from "../vm/objects.ts"
import { INTRINSIC_NAMES, NATIVE_CODE } from "../vm/intrinsics.ts"
import {
  create_context,
  evaluate_context,
  dispose_context,
} from "../vm/interpreter.ts"
import { create_scheduler } from "./scheduler.ts"
import { create_node_host } from "../host/node.ts"

import type { ModuleStateBytes, ModuleStatus } from "./module-state.ts"
import {
  MODULE_STATE,
  create_module_state,
  module_state_status,
  module_state_set_status,
  module_state_environment_root,
  module_state_error_root,
} from "./module-state.ts"
export { MODULE_STATE } from "./module-state.ts"

const BUILTINS = new Map([
  ["node:console", new URL("../stdlib/node/console.js", import.meta.url)],
  [
    "node:fs/promises",
    new URL("../stdlib/node/fs/promises.js", import.meta.url),
  ],
])

export type CodeId = Brand<number, "CodeId">

export interface LinkedCode {
  unit: CompiledModule
  constants: Root[]
  scope_ids: number[]
  block_scope_ids: number[][]
  bytecodes: Uint8Array[]
}

export interface RuntimeScope {
  binding_flags: boolean[]
  import_bindings: Map<number, { module_id: number; slot: number }>
}

export interface ModuleRecord {
  id: number
  identity: string
  unit: CompiledModule | null
  code_id: CodeId | null
  state: ModuleStateBytes
  dependencies: number[]
  exports: Map<string, number>
  readonly environment: Root
  readonly error: Root
}

export interface RuntimeOptions extends MemoryOptions {
  host?: NodeHost
  max_steps?: number
}

export interface Runtime {
  memory: Memory
  host: NodeHost
  max_steps: number
  code: LinkedCode[]
  scopes: RuntimeScope[]
  modules: ModuleRecord[]
  identities: Map<string, number>
  globals: Map<string, Root>
  contexts: Context[]
  scheduler: Scheduler
  coercions?: Map<string, Root>
  error_prototypes?: Map<string, Root>
  promise_await?: Root
  promise_capability?: Root
}

export function create_runtime({
  host = create_node_host(),
  max_steps = 1000000,
  ...memory_options
}: RuntimeOptions = {}): Runtime {
  const runtime: Runtime = {
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
  ] as [string, number | undefined][]) {
    const root = alloc_root(runtime.memory)
    if (value === undefined) write_undefined(runtime.memory, root)
    else write_number(runtime.memory, root, value)
    runtime.globals.set(name, root)
  }
  return runtime
}

export function module_status(module: ModuleRecord): ModuleStatus {
  return module_state_status(module.state)
}
export function set_module_status(module: ModuleRecord, status: ModuleStatus) {
  module_state_set_status(module.state, status)
}

function link_code(runtime: Runtime, unit: CompiledModule) {
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
  const block_scope_ids = unit.functions.map((fn) =>
    fn.block_binding_flags.map((binding_flags) => {
      const id = runtime.scopes.length
      runtime.scopes.push({ binding_flags, import_bindings: new Map() })
      return id
    }),
  )
  const id = runtime.code.length as CodeId
  runtime.code.push({
    unit,
    constants,
    scope_ids,
    block_scope_ids,
    bytecodes: unit.functions.map((fn) => fn.bytecode),
  })
  return id
}

export function resolve_specifier(specifier: string, importer: string) {
  if (specifier.startsWith("node:") || specifier.startsWith("djs:")) {
    if (specifier !== "djs:intrinsics" && !BUILTINS.has(specifier))
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

function instantiate_module(
  runtime: Runtime,
  identity: string,
  {
    unit = null,
    code_id = null,
    scope_id,
    exports,
  }: {
    unit?: CompiledModule | null
    code_id?: CodeId | null
    scope_id: number
    exports: ExportBinding[]
  },
): ModuleRecord {
  const state = create_module_state(
    alloc_root(runtime.memory),
    alloc_root(runtime.memory),
  )
  const module: ModuleRecord = {
    id: runtime.modules.length,
    identity,
    unit,
    code_id,
    state,
    dependencies: [],
    exports: new Map(exports.map((item) => [item.name, item.slot])),
    get environment() {
      return module_state_environment_root(module.state)
    },
    get error() {
      return module_state_error_root(module.state)
    },
  }
  create_environment(
    runtime.memory,
    module.environment,
    undefined,
    runtime.scopes[scope_id].binding_flags.length,
    scope_id,
  )
  runtime.modules.push(module)
  runtime.identities.set(identity, module.id)
  return module
}

function load_intrinsics(runtime: Runtime): ModuleRecord {
  const scope_id = runtime.scopes.length
  runtime.scopes.push({
    binding_flags: INTRINSIC_NAMES.map(() => true),
    import_bindings: new Map(),
  })
  const module = instantiate_module(runtime, "djs:intrinsics", {
    scope_id,
    exports: INTRINSIC_NAMES.map((name, slot) => ({ name, slot })),
  })
  const value = alloc_root(runtime.memory)
  try {
    for (let slot = 0; slot < INTRINSIC_NAMES.length; slot++) {
      create_function(runtime.memory, value, NATIVE_CODE, slot)
      store_binding(runtime, module.environment, slot, value, true)
    }
    set_module_status(module, MODULE_STATE.EVALUATED)
    return module
  } catch (error) {
    set_module_status(module, MODULE_STATE.ERRORED)
    write_string(runtime.memory, module.error, error.message)
    throw error
  } finally {
    free_root(runtime.memory, value)
  }
}

export async function load_module(
  runtime: Runtime,
  identity: string,
): Promise<ModuleRecord> {
  const cached = runtime.identities.get(identity)
  if (cached !== undefined) return runtime.modules[cached]
  if (identity === "djs:intrinsics") return load_intrinsics(runtime)
  const builtin = BUILTINS.get(identity)
  const path = fileURLToPath(builtin ?? new URL(identity))
  const source = await runtime.host.read_text(path, "utf8")
  const unit = compile_module(source, path)
  const code_id = link_code(runtime, unit)
  const scope_id = runtime.code[code_id].scope_ids[unit.entry]
  const module = instantiate_module(runtime, identity, {
    unit,
    code_id,
    scope_id,
    exports: unit.exports,
  })
  const imports = runtime.scopes[scope_id].import_bindings
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

export async function evaluate_module(
  runtime: Runtime,
  module: ModuleRecord,
  ancestors: Set<number> = new Set(),
): Promise<ModuleRecord> {
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
    context = create_context(runtime, module.code_id!, module.environment)
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

export function read_export(
  runtime: Runtime,
  module: ModuleRecord,
  name: string,
  destination: Root,
) {
  const slot = module.exports.get(name)
  if (slot === undefined) throw new SyntaxError(`Missing export: ${name}`)
  load_binding(runtime, destination, module.environment, slot)
}

export async function run_module(
  runtime: Runtime,
  path: string | URL,
): Promise<ModuleRecord> {
  const identity =
    path instanceof URL ? path.href : pathToFileURL(resolve(path)).href
  const module = await load_module(runtime, identity)
  return evaluate_module(runtime, module)
}
