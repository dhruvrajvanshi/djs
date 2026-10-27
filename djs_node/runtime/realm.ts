import type { Runtime } from "./runtime.ts"
import type { ModuleRecord } from "./modules.ts"
import type { RealmDeclaration } from "../compiler/compile.ts"
import type { Heap } from "../vm/storage/heap.ts"
import type { Handle, Persistent } from "../vm/storage/heap.ts"
import { write_number, write_undefined } from "../vm/storage/value.ts"
import { write_string } from "../vm/heap_types/string.ts"
import { create_symbol } from "../vm/heap_types/symbol.ts"
import {
  create_object,
  create_function,
  create_array,
  create_string_object,
} from "../vm/semantics/objects.ts"
import { initialize_binding } from "../vm/semantics/bindings.ts"
import { BUILTIN_CODE } from "../vm/execution/native_operations.ts"

export const WELL_KNOWN_SYMBOLS = Object.freeze([
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
])

/** Every handle here is owned by the realm and lives as long as the runtime. */
export class Realm {
  /** The realm's well-known objects, abstract operations and internal methods by name. */
  intrinsics = new Map<string, Persistent>()
  /** Private keys of internal slots the VM does not represent itself. */
  slot_keys = new Map<string, Persistent>()
  /** Keyed by name without the "Symbol." prefix. */
  well_known_symbols = new Map<string, Persistent>()
  globals = new Map<string, Persistent>()
  // Undefined until create_realm allocates them; objects created before then
  // have a null prototype.
  object_prototype?: Persistent
  function_prototype?: Persistent
  array_prototype?: Persistent
  string_prototype?: Persistent
  symbol_prototype?: Persistent

  constructor(heap: Heap) {
    for (const [name, value] of [
      ["undefined", undefined],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ] as [string, number | undefined][]) {
      const global = heap.handles.persistent()
      if (value === undefined) write_undefined(heap, global)
      else write_number(heap, global, value)
      this.globals.set(name, global)
    }
  }
}

const PROTOTYPE_FIELDS = Object.freeze({
  "%Object.prototype%": "object_prototype",
  "%Function.prototype%": "function_prototype",
  "%Array.prototype%": "array_prototype",
  "%String.prototype%": "string_prototype",
  "%Symbol.prototype%": "symbol_prototype",
} as const)

export function set_realm_intrinsic(
  runtime: Runtime,
  name: string,
  value: Handle,
) {
  const intrinsic = runtime.heap.handles.persistent()
  runtime.heap.copy_value(intrinsic, value)
  runtime.realm.intrinsics.set(name, intrinsic)
  const field = PROTOTYPE_FIELDS[name as keyof typeof PROTOTYPE_FIELDS]
  if (field) runtime.realm[field] = intrinsic
}

/** Allocates the symbols and property keys the VM uses directly. */
export function create_well_known_values(runtime: Runtime) {
  const { heap, realm } = runtime
  heap.handles.scope(() => {
    const description = heap.handles.local()
    for (const name of WELL_KNOWN_SYMBOLS) {
      const symbol = heap.handles.persistent()
      write_string(heap, description, `Symbol.${name}`)
      create_symbol(heap, symbol, description)
      realm.well_known_symbols.set(name, symbol)
    }
  })
}

// What the VM uses from the stdlib; see docs/realm.md.
const REQUIRED = Object.freeze([
  "%Object.prototype%",
  "%Function.prototype%",
  "%Array.prototype%",
  "%String.prototype%",
  "%Symbol.prototype%",
  "%Error%",
  "%TypeError%",
  "%RangeError%",
  "%ReferenceError%",
  "%SyntaxError%",
  "ToPrimitive",
  "ToString",
  "ToNumber",
  "NewPromiseCapability",
  "Await",
  "RegExpCreate",
  "CopyDataProperties",
  "array [[DefineOwnProperty]]",
])

// Allocated first, so every later object and function inherits from them.
const ALLOCATED_FIRST = ["%Object.prototype%", "%Function.prototype%"]

function declaration_name(declaration: RealmDeclaration) {
  return declaration.kind === "internal_method"
    ? `${declaration.object} ${declaration.method}`
    : declaration.name
}

/**
 * CreateIntrinsics (ECMA-262 9.3.2): allocates every well-known object of the
 * linked stdlib before it is evaluated, and marks the bindings of abstract
 * operations and internal methods so the VM receives them when initialized.
 */
export function create_realm(runtime: Runtime) {
  const declarations = new Map<
    string,
    { module: ModuleRecord; declaration: RealmDeclaration }
  >()
  for (const module of runtime.loader.modules)
    for (const declaration of module.unit?.realm ?? []) {
      const name = declaration_name(declaration)
      if (declarations.has(name))
        throw new SyntaxError(`${name} is declared more than once`)
      declarations.set(name, { module, declaration })
    }
  for (const name of REQUIRED)
    if (!declarations.has(name))
      throw new SyntaxError(`The stdlib does not declare ${name}`)
  const ordered = [...declarations].sort(([a], [b]) => rank(a) - rank(b))
  for (const [name, { module, declaration }] of ordered) {
    if (declaration.kind !== "well_known") {
      const scope = runtime.loader.scopes[module.scope_id]
      ;(scope.intrinsic_bindings ??= new Map()).set(declaration.slot, name)
      continue
    }
    runtime.heap.handles.scope(() => {
      const object = runtime.heap.handles.local()
      allocate(runtime, object, declaration.object)
      initialize_binding(runtime, module.environment, declaration.slot, object)
      set_realm_intrinsic(runtime, name, object)
    })
  }
}

function rank(name: string) {
  const index = ALLOCATED_FIRST.indexOf(name)
  return index === -1 ? ALLOCATED_FIRST.length : index
}

function allocate(
  runtime: Runtime,
  destination: Handle,
  kind: Extract<RealmDeclaration, { kind: "well_known" }>["object"],
) {
  const { heap } = runtime
  if (kind === "function")
    create_function(runtime, destination, BUILTIN_CODE, 0)
  else if (kind === "array") create_array(runtime, destination, 0)
  else if (kind === "string") {
    heap.handles.scope(() => {
      const empty = heap.handles.local()
      write_string(heap, empty, "")
      create_string_object(runtime, destination, empty)
    })
  } else create_object(runtime, destination)
}
