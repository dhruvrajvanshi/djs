import type { Brand } from "../utils.ts"
import {
  VALUE_TAGS,
  heap_type_of,
  tag_of,
  write_boolean,
  write_null,
  write_number,
  write_undefined,
} from "../vm/storage/value.ts"
import type { ExportBinding, CompiledModule } from "../compiler/compile.ts"
import type { Runtime } from "./runtime.ts"
import { resolve, isAbsolute, dirname, join } from "node:path"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile_module, located_message } from "../compiler/compile.ts"
import { read_string, write_string } from "../vm/heap_types/string.ts"
import { create_environment } from "../vm/heap_types/environment.ts"
import { is_object } from "../vm/heap_types/object.ts"
import { get_property } from "../vm/semantics/properties.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import { create_function } from "../vm/semantics/objects.ts"
import { load_binding, initialize_binding } from "../vm/semantics/bindings.ts"
import { declare_slot, get_slot } from "../vm/semantics/internal_slots.ts"
import {
  THROW,
  clear_exception,
  take_exception,
} from "../vm/semantics/errors.ts"
import { to_string } from "../vm/semantics/operations.ts"
import {
  NATIVE_MODULES,
  NATIVE_CODE,
} from "../vm/execution/native_operations.ts"
import { panic } from "../utils.ts"
import type { HostError } from "../host/node.ts"
import { FIBER_STATE } from "../vm/execution/fiber.ts"
import {
  create_fiber,
  dispose_fiber,
  settle_with_promise,
} from "../vm/execution/calls.ts"
import { run_task } from "../vm/execution/interpreter.ts"
import {
  drain_completions,
  drain_jobs,
  wait_for_completion,
} from "./scheduler.ts"
import type { Handle, Persistent } from "../vm/storage/heap.ts"

const BUILTINS = new Map([
  ["djs:abstract", new URL("../stdlib/js/abstract.js", import.meta.url)],
  ["node:console", new URL("../stdlib/node/console.js", import.meta.url)],
  ["node:path", new URL("../stdlib/node/path.js", import.meta.url)],
  ["node:fs", new URL("../stdlib/node/fs.js", import.meta.url)],
  ["node:assert", new URL("../stdlib/node/assert.js", import.meta.url)],
  [
    "node:assert/strict",
    new URL("../stdlib/node/assert/strict.js", import.meta.url),
  ],
  [
    "node:fs/promises",
    new URL("../stdlib/node/fs/promises.js", import.meta.url),
  ],
  ["node:url", new URL("../stdlib/node/url.js", import.meta.url)],
])

export const MODULE_STATE = Object.freeze({
  LINKING: 0,
  LINKED: 1,
  EVALUATING: 2,
  EVALUATED: 3,
  ERRORED: 4,
})
export type ModuleStatus = (typeof MODULE_STATE)[keyof typeof MODULE_STATE]

export type CodeId = Brand<number, "CodeId">

export interface LinkedCode {
  unit: CompiledModule
  constants: Persistent[]
  scope_ids: number[]
  block_scope_ids: number[][]
  bytecodes: Uint8Array[]
}

/** A slot in a module's environment. */
export interface ModuleBinding {
  module_id: number
  slot: number
}

export interface RuntimeScope {
  binding_flags: boolean[]
  import_bindings: Map<number, ModuleBinding>
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
  /** Export names, mapped to the bindings they resolve to once linked. */
  readonly exports: Map<string, ModuleBinding>
  /** Names that `export *` gets from more than one binding. */
  readonly ambiguous_exports = new Set<string>()
  /** `error` holds the evaluation error, or undefined. */
  readonly environment: Persistent
  readonly error: Persistent

  constructor(fields: {
    id: number
    identity: string
    unit: CompiledModule | null
    code_id: CodeId | null
    scope_id: number
    exports: Map<string, ModuleBinding>
    environment: Persistent
    error: Persistent
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
    const constant = runtime.heap.handles.persistent()
    if (typeof literal === "string")
      write_string(runtime.heap, constant, literal)
    else if (typeof literal === "number")
      write_number(runtime.heap, constant, literal)
    else if (typeof literal === "boolean")
      write_boolean(runtime.heap, constant, literal)
    else if (literal === null) write_null(runtime.heap, constant)
    constants.push(constant)
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
  for (const name of unit.slot_names) declare_slot(runtime, name)
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
      throw Object.assign(new Error(`No such built-in module: ${specifier}`), {
        code: "ERR_UNKNOWN_BUILTIN_MODULE",
      })
    return specifier
  }
  if (specifier.startsWith("file:")) return new URL(specifier).href
  if (isAbsolute(specifier)) return pathToFileURL(specifier).href
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!importer.startsWith("file:"))
      throw new SyntaxError("Relative imports require a file module")
    return new URL(specifier, importer).href
  }
  if (!importer.startsWith("file:"))
    throw new SyntaxError("Package imports require a file module")
  return resolve_package(specifier, fileURLToPath(importer))
}

const CONDITIONS = ["node", "import", "default"]

function module_not_found(specifier: string, importer: string) {
  return Object.assign(
    new Error(`Cannot find package '${specifier}' imported from ${importer}`),
    { code: "ERR_MODULE_NOT_FOUND" },
  )
}

// Node's ESM resolution: walk up node_modules directories, then map the
// subpath through package.json "exports", falling back to "main".
function resolve_package(specifier: string, importer: string) {
  const parts = specifier.split("/")
  const name_length = specifier.startsWith("@") ? 2 : 1
  const name = parts.slice(0, name_length).join("/")
  if (parts.length < name_length || parts.slice(0, name_length).includes(""))
    throw new TypeError(`Invalid module specifier: ${specifier}`)
  const subpath = [".", ...parts.slice(name_length)].join("/")
  let directory = dirname(importer)
  while (true) {
    const root = join(directory, "node_modules", name)
    if (existsSync(join(root, "package.json")))
      return resolve_in_package(root, subpath, specifier, importer)
    const parent = dirname(directory)
    if (parent === directory) throw module_not_found(specifier, importer)
    directory = parent
  }
}

function resolve_in_package(
  root: string,
  subpath: string,
  specifier: string,
  importer: string,
) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  let target: string
  if (manifest.exports !== undefined && manifest.exports !== null) {
    const exported = resolve_exports(manifest.exports, subpath)
    if (exported === null)
      throw Object.assign(
        new Error(
          `Package subpath '${subpath}' is not exported from ${root}/package.json`,
        ),
        { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" },
      )
    target = exported
  } else if (subpath === ".") {
    target = typeof manifest.main === "string" ? manifest.main : "index.js"
  } else {
    target = subpath
  }
  const path = resolve(root, target)
  if (!existsSync(path)) throw module_not_found(specifier, importer)
  return pathToFileURL(realpathSync(path)).href
}

function resolve_exports(exports: unknown, subpath: string): string | null {
  const is_subpath_map =
    typeof exports === "object" &&
    !Array.isArray(exports) &&
    Object.keys(exports!).some((key) => key.startsWith("."))
  if (!is_subpath_map)
    return subpath === "." ? resolve_export_target(exports, null) : null
  const map = exports as Record<string, unknown>
  if (Object.hasOwn(map, subpath) && !subpath.includes("*"))
    return resolve_export_target(map[subpath], null)
  let best: string | null = null
  for (const key of Object.keys(map)) {
    const star = key.indexOf("*")
    if (star === -1 || key.indexOf("*", star + 1) !== -1) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (
      subpath.startsWith(prefix) &&
      subpath.length >= key.length &&
      subpath.endsWith(suffix) &&
      (best === null || pattern_key_compare(best, key) > 0)
    )
      best = key
  }
  if (best === null) return null
  const star = best.indexOf("*")
  const match = subpath.slice(star, subpath.length - (best.length - star - 1))
  return resolve_export_target(map[best], match)
}

// Orders pattern keys so the most specific one comes first.
function pattern_key_compare(a: string, b: string) {
  const a_base = a.indexOf("*") + 1
  const b_base = b.indexOf("*") + 1
  if (a_base !== b_base) return b_base - a_base
  return b.length - a.length
}

function resolve_export_target(
  target: unknown,
  match: string | null,
): string | null {
  if (typeof target === "string") {
    if (!target.startsWith("./"))
      throw new Error(`Invalid package target: ${target}`)
    return match === null ? target : target.replaceAll("*", match)
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      const resolved = resolve_export_target(item, match)
      if (resolved !== null) return resolved
    }
    return null
  }
  if (target !== null && typeof target === "object") {
    for (const [condition, value] of Object.entries(target)) {
      if (condition !== "default" && !CONDITIONS.includes(condition)) continue
      const resolved = resolve_export_target(value, match)
      if (resolved !== null) return resolved
    }
  }
  return null
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
  const id = runtime.loader.modules.length
  const module = new ModuleRecord({
    id,
    identity,
    unit,
    code_id,
    scope_id,
    exports: new Map(
      exports.map((item) => [item.name, { module_id: id, slot: item.slot }]),
    ),
    environment: runtime.heap.handles.persistent(),
    error: runtime.heap.handles.persistent(),
  })
  create_environment(
    runtime.heap,
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
  return runtime.heap.handles.scope(() => {
    const value = runtime.heap.handles.local()
    try {
      for (let slot = 0; slot < names.length; slot++) {
        create_function(runtime, value, NATIVE_CODE, ids.get(names[slot])!)
        initialize_binding(runtime, module.environment, slot, value)
      }
      module.status = MODULE_STATE.EVALUATED
      return module
    } catch (error) {
      module.status = MODULE_STATE.ERRORED
      write_string(runtime.heap, module.error, error.message)
      throw error
    }
  })
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
  const local_exports = new Set(module.exports.keys())
  try {
    for (const declaration of unit.imports) {
      let specifier
      try {
        specifier = resolve_specifier(
          declaration.specifier,
          builtin ? builtin.href : identity,
        )
      } catch (error) {
        error.message = located_message(path, source, [
          { message: error.message, span: declaration.span },
        ])
        throw error
      }
      const target = await load_module(runtime, specifier)
      module.dependencies.push(target.id)
      if (declaration.star_export) {
        if (target.status === MODULE_STATE.LINKING)
          throw new SyntaxError(
            located_message(path, source, [
              {
                message: "Cyclic export * is not implemented yet",
                span: declaration.span,
              },
            ]),
          )
        star_export(module, local_exports, target)
      }
      for (const binding of declaration.bindings) {
        const resolved = target.exports.get(binding.imported)
        if (resolved === undefined)
          throw new SyntaxError(
            located_message(path, source, [
              {
                message: target.ambiguous_exports.has(binding.imported)
                  ? `The requested module '${declaration.specifier}' contains conflicting star exports for name '${binding.imported}'`
                  : `The requested module '${declaration.specifier}' does not provide an export named '${binding.imported}'`,
                span: binding.span,
              },
            ]),
          )
        imports.set(binding.slot, resolved)
      }
    }
    for (const [name, binding] of module.exports)
      module.exports.set(name, resolve_binding(runtime, binding))
    module.status = MODULE_STATE.LINKED
    return module
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    write_string(runtime.heap, module.error, error.message)
    throw error
  }
}

// Follows re-exports to the binding that holds the value, so that bindings
// can be compared and loads don't go through intermediate modules.
function resolve_binding(runtime: Runtime, binding: ModuleBinding) {
  while (true) {
    const { scope_id } = runtime.loader.modules[binding.module_id]
    const next = runtime.loader.scopes[scope_id].import_bindings.get(
      binding.slot,
    )
    if (!next) return Object.freeze(binding)
    binding = next
  }
}

// Adds the target's exports, except `default` and names the module exports
// itself. A name two star exports give different bindings becomes ambiguous.
function star_export(
  module: ModuleRecord,
  local_exports: Set<string>,
  target: ModuleRecord,
) {
  const names = [...target.exports.keys(), ...target.ambiguous_exports]
  for (const name of names) {
    if (name === "default" || local_exports.has(name)) continue
    if (module.ambiguous_exports.has(name)) continue
    const binding = target.exports.get(name)
    const existing = module.exports.get(name)
    if (
      binding === undefined ||
      (existing &&
        (existing.module_id !== binding.module_id ||
          existing.slot !== binding.slot))
    ) {
      module.exports.delete(name)
      module.ambiguous_exports.add(name)
    } else module.exports.set(name, binding)
  }
}

// Returns false if the module was already evaluated.
function start_evaluation(module: ModuleRecord, ancestors: Set<number>) {
  if (module.status === MODULE_STATE.EVALUATED) return false
  if (module.status === MODULE_STATE.ERRORED)
    throw new Error(`Module evaluation failed: ${module.identity}`)
  if (ancestors.has(module.id))
    throw new SyntaxError("Cyclic module evaluation is not implemented yet")
  module.status = MODULE_STATE.EVALUATING
  return true
}

/**
 * Evaluates a stdlib module and its dependencies as part of setting up the
 * realm. Realm setup is synchronous, so the stdlib can't use top-level await.
 */
export function evaluate_realm_module(
  runtime: Runtime,
  module: ModuleRecord,
  ancestors: Set<number> = new Set(),
) {
  if (!start_evaluation(module, ancestors)) return
  const chain = new Set(ancestors).add(module.id)
  let fiber
  try {
    for (const id of module.dependencies)
      evaluate_realm_module(runtime, runtime.loader.modules[id], chain)
    fiber = create_fiber(runtime, module.code_id!, module.environment)
    run_task(runtime, fiber)
    if (fiber.status === FIBER_STATE.FAILED)
      throw new Error(to_string(runtime, fiber.error))
    if (fiber.status !== FIBER_STATE.DONE)
      panic("Stdlib modules must evaluate synchronously")
    module.status = MODULE_STATE.EVALUATED
    write_undefined(runtime.heap, module.error)
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    if (fiber) runtime.heap.copy_value(module.error, fiber.error)
    else write_string(runtime.heap, module.error, error.message)
    throw error
  } finally {
    if (fiber) dispose_fiber(runtime, fiber)
  }
}

/**
 * Evaluates a program module and its dependencies. Like an async function
 * call, the module's fiber settles a promise when it finishes. This runs
 * jobs and host operations until that promise rejects, or until it is
 * fulfilled and nothing is left to run.
 */
export async function evaluate_module(
  runtime: Runtime,
  module: ModuleRecord,
  ancestors: Set<number> = new Set(),
): Promise<ModuleRecord> {
  if (!start_evaluation(module, ancestors)) return module
  const chain = new Set(ancestors).add(module.id)
  const { heap } = runtime
  // Not a local handle: evaluation awaits, and scopes can't span an await.
  const promise = heap.handles.persistent()
  let fiber
  let guest_error = false
  try {
    for (const id of module.dependencies)
      await evaluate_module(runtime, runtime.loader.modules[id], chain)
    fiber = create_fiber(runtime, module.code_id!, module.environment)
    if (settle_with_promise(runtime, fiber, promise) === THROW) {
      take_exception(runtime, module.error)
      guest_error = true
      throw new UncaughtException(error_report(runtime, module.error))
    }
    run_task(runtime, fiber)
    await run_event_loop(runtime, promise)
    if (promise_state(runtime, promise) === "rejected") {
      get_slot(runtime, module.error, promise, "[[PromiseResult]]")
      guest_error = true
      throw new UncaughtException(error_report(runtime, module.error))
    }
    module.status = MODULE_STATE.EVALUATED
    // Module evaluation fulfills with undefined; exports live in its environment.
    write_undefined(heap, module.error)
    return module
  } catch (error) {
    module.status = MODULE_STATE.ERRORED
    if (!guest_error) write_string(heap, module.error, error.message)
    throw error
  } finally {
    if (fiber) dispose_fiber(runtime, fiber)
    heap.handles.release(promise)
  }
}

/** A guest exception that escaped module evaluation. */
export class UncaughtException extends Error {}

// The value's stack if it has one, since that already starts with its message.
function error_report(runtime: Runtime, value: Handle) {
  const { heap } = runtime
  if (!is_object(heap, value)) return to_string(runtime, value)
  return heap.handles.scope(() => {
    const key = heap.handles.local(),
      stack = heap.handles.local()
    write_string(heap, key, "stack")
    const accessor = get_property(runtime, stack, value, key)
    if (
      !accessor &&
      tag_of(heap, stack) === VALUE_TAGS.REF &&
      heap_type_of(heap, stack) === HEAP_TYPES.STRING
    )
      return read_string(heap, stack)
    return to_string(runtime, value)
  })
}

function promise_state(runtime: Runtime, promise: Handle) {
  return runtime.heap.handles.scope(() => {
    const state = runtime.heap.handles.local()
    get_slot(runtime, state, promise, "[[PromiseState]]")
    return read_string(runtime.heap, state)
  })
}

async function run_event_loop(runtime: Runtime, promise: Handle) {
  const { scheduler } = runtime
  while (true) {
    drain_completions(runtime)
    drain_jobs(runtime)
    if (scheduler.has_jobs() || scheduler.completions.length !== 0) continue
    const state = promise_state(runtime, promise)
    if (state === "rejected") return
    if (scheduler.pending_operations !== 0) {
      await wait_for_completion(runtime)
      continue
    }
    if (state === "fulfilled") return
    const error: HostError = new Error("Top-level await did not settle")
    error.exit_code = 13
    throw error
  }
}

export function read_export(
  runtime: Runtime,
  module: ModuleRecord,
  name: string,
  destination: Handle,
) {
  const binding = module.exports.get(name)
  if (binding === undefined) throw new SyntaxError(`Missing export: ${name}`)
  const { environment } = runtime.loader.modules[binding.module_id]
  if (load_binding(runtime, destination, environment, binding.slot) === THROW) {
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
