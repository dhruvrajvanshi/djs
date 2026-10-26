import type { Brand } from "../utils.ts"
import type { Root } from "../vm/storage/value.ts"
import {
  write_boolean,
  write_null,
  write_number,
  write_undefined,
} from "../vm/storage/value.ts"
import type { ExportBinding, CompiledModule } from "../compiler/compile.ts"
import type { Runtime } from "./runtime.ts"
import { resolve, isAbsolute } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile_module } from "../compiler/compile.ts"
import { write_string } from "../vm/records/string.ts"
import { create_environment } from "../vm/records/environment.ts"
import { create_function } from "../vm/semantics/objects.ts"
import { load_binding, initialize_binding } from "../vm/semantics/bindings.ts"
import { THROW, clear_exception } from "../vm/semantics/errors.ts"
import { NATIVE_MODULES, NATIVE_CODE } from "../vm/execution/intrinsics.ts"
import { create_context, dispose_context } from "../vm/execution/calls.ts"
import { evaluate_context } from "../vm/execution/interpreter.ts"

const BUILTINS = new Map([
  ["djs:abstract", new URL("../stdlib/js/abstract.js", import.meta.url)],
  ["node:console", new URL("../stdlib/node/console.js", import.meta.url)],
  ["node:path", new URL("../stdlib/node/path.js", import.meta.url)],
  [
    "node:fs/promises",
    new URL("../stdlib/node/fs/promises.js", import.meta.url),
  ],
])

export const MODULE_STATE = Object.freeze({
  LINKING: 0,
  LINKED: 1,
  EVALUATING: 2,
  AWAITING: 3,
  EVALUATED: 4,
  ERRORED: 5,
})
export type ModuleStatus = (typeof MODULE_STATE)[keyof typeof MODULE_STATE]

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
  /** Slots whose value the VM receives as a realm intrinsic once initialized. */
  intrinsic_bindings?: Map<number, string>
}

export class ModuleRecord {
  readonly id: number
  readonly identity: string
  readonly unit: CompiledModule | null
  readonly code_id: CodeId | null
  readonly scope_id: number
  status: ModuleStatus = MODULE_STATE.LINKING
  dependencies: number[] = []
  readonly exports: Map<string, number>
  /** Owned roots. `error` holds the evaluation error, or undefined. */
  readonly environment: Root
  readonly error: Root

  constructor(fields: {
    id: number
    identity: string
    unit: CompiledModule | null
    code_id: CodeId | null
    scope_id: number
    exports: Map<string, number>
    environment: Root
    error: Root
  }) {
    this.id = fields.id
    this.identity = fields.identity
    this.unit = fields.unit
    this.code_id = fields.code_id
    this.scope_id = fields.scope_id
    this.exports = fields.exports
    this.environment = fields.environment
    this.error = fields.error
  }
}

/** Linked code and module records, by id. */
export class ModuleLoader {
  code: LinkedCode[] = []
  scopes: RuntimeScope[] = []
  modules: ModuleRecord[] = []
  identities = new Map<string, number>()
}

function link_code(runtime: Runtime, unit: CompiledModule) {
  const constants = []
  for (const literal of unit.literals) {
    const root = runtime.memory.alloc_root()
    if (typeof literal === "string") write_string(runtime.memory, root, literal)
    else if (typeof literal === "number")
      write_number(runtime.memory, root, literal)
    else if (typeof literal === "boolean")
      write_boolean(runtime.memory, root, literal)
    else if (literal === null) write_null(runtime.memory, root)
    constants.push(root)
  }
  const scope_ids = unit.functions.map((fn) => {
    const id = runtime.loader.scopes.length
    runtime.loader.scopes.push({
      binding_flags: fn.binding_flags,
      import_bindings: new Map(),
    })
    return id
  })
  const block_scope_ids = unit.functions.map((fn) =>
    fn.block_binding_flags.map((binding_flags) => {
      const id = runtime.loader.scopes.length
      runtime.loader.scopes.push({ binding_flags, import_bindings: new Map() })
      return id
    }),
  )
  const id = runtime.loader.code.length as CodeId
  runtime.loader.code.push({
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
    if (!NATIVE_MODULES.has(specifier) && !BUILTINS.has(specifier))
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
  const module = new ModuleRecord({
    id: runtime.loader.modules.length,
    identity,
    unit,
    code_id,
    scope_id,
    exports: new Map(exports.map((item) => [item.name, item.slot])),
    environment: runtime.memory.alloc_root(),
    error: runtime.memory.alloc_root(),
  })
  create_environment(
    runtime.memory,
    module.environment,
    undefined,
    runtime.loader.scopes[scope_id].binding_flags.length,
    scope_id,
  )
  runtime.loader.modules.push(module)
  runtime.loader.identities.set(identity, module.id)
  return module
}

function load_native_module(
  runtime: Runtime,
  identity: string,
  ids: Map<string, number>,
): ModuleRecord {
  const names = [...ids.keys()]
  const scope_id = runtime.loader.scopes.length
  runtime.loader.scopes.push({
    binding_flags: names.map(() => true),
    import_bindings: new Map(),
  })
  const module = instantiate_module(runtime, identity, {
    scope_id,
    exports: names.map((name, slot) => ({ name, slot })),
  })
  const value = runtime.memory.alloc_root()
  try {
    for (let slot = 0; slot < names.length; slot++) {
      create_function(runtime, value, NATIVE_CODE, ids.get(names[slot])!)
      initialize_binding(runtime, module.environment, slot, value)
    }
    module.status = MODULE_STATE.EVALUATED
    return module
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    write_string(runtime.memory, module.error, error.message)
    throw error
  } finally {
    runtime.memory.free_root(value)
  }
}

export async function load_module(
  runtime: Runtime,
  identity: string,
): Promise<ModuleRecord> {
  const cached = runtime.loader.identities.get(identity)
  if (cached !== undefined) return runtime.loader.modules[cached]
  const native = NATIVE_MODULES.get(identity)
  if (native) return load_native_module(runtime, identity, native)
  const builtin = BUILTINS.get(identity)
  const path = fileURLToPath(builtin ?? new URL(identity))
  const source = await runtime.host.read_text(path, "utf8")
  const unit = compile_module(source, path, builtin?.href ?? identity)
  const code_id = link_code(runtime, unit)
  const scope_id = runtime.loader.code[code_id].scope_ids[unit.entry]
  const module = instantiate_module(runtime, identity, {
    unit,
    code_id,
    scope_id,
    exports: unit.exports,
  })
  const imports = runtime.loader.scopes[scope_id].import_bindings
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
    module.status = MODULE_STATE.LINKED
    return module
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    write_string(runtime.memory, module.error, error.message)
    throw error
  }
}

export async function evaluate_module(
  runtime: Runtime,
  module: ModuleRecord,
  ancestors: Set<number> = new Set(),
): Promise<ModuleRecord> {
  if (module.status === MODULE_STATE.EVALUATED) return module
  if (module.status === MODULE_STATE.ERRORED)
    throw new Error(`Module evaluation failed: ${module.identity}`)
  if (ancestors.has(module.id))
    throw new SyntaxError("Cyclic module evaluation is not implemented yet")
  const chain = new Set(ancestors).add(module.id)
  let context
  try {
    module.status = MODULE_STATE.EVALUATING
    for (const id of module.dependencies)
      await evaluate_module(runtime, runtime.loader.modules[id], chain)
    context = create_context(runtime, module.code_id!, module.environment)
    context.module = module
    await evaluate_context(runtime, context)
    module.status = MODULE_STATE.EVALUATED
    // Module evaluation fulfills with undefined; exports live in its environment.
    write_undefined(runtime.memory, module.error)
    return module
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    if (context) runtime.memory.copy_value(module.error, context.error)
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
  if (load_binding(runtime, destination, module.environment, slot) === THROW) {
    clear_exception(runtime)
    throw new ReferenceError("Cannot access binding before initialization")
  }
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
