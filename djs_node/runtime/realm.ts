import type { Runtime } from "./runtime.ts"
import type { ModuleRecord } from "./modules.ts"
import type { RealmDeclaration } from "../compiler/compile.ts"
import type { Memory } from "../vm/storage/memory.ts"
import type { Root } from "../vm/storage/value.ts"
import { write_number, write_undefined } from "../vm/storage/value.ts"
import { write_string } from "../vm/records/string.ts"
import { create_symbol } from "../vm/records/symbol.ts"
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

/** Property keys the VM reads itself, such as iterator result fields. */
const PROPERTY_NAMES = Object.freeze([
  "next",
  "done",
  "value",
  "return",
  "length",
])

/** Every root here is owned by the realm and lives as long as the runtime. */
export class Realm {
  /** The realm's well-known objects, abstract operations and internal methods by name. */
  intrinsics = new Map<string, Root>()
  /** Private keys of internal slots the VM does not represent itself. */
  slot_keys = new Map<string, Root>()
  /** Keyed by name without the "Symbol." prefix. */
  well_known_symbols = new Map<string, Root>()
  property_names = new Map<string, Root>()
  globals = new Map<string, Root>()
  // Undefined until create_realm allocates them; objects created before then
  // have a null prototype.
  object_prototype?: Root
  function_prototype?: Root
  array_prototype?: Root
  string_prototype?: Root
  symbol_prototype?: Root

  constructor(memory: Memory) {
    for (const [name, value] of [
      ["undefined", undefined],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ] as [string, number | undefined][]) {
      const root = memory.alloc_root()
      if (value === undefined) write_undefined(memory, root)
      else write_number(memory, root, value)
      this.globals.set(name, root)
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
  value: Root,
) {
  const root = runtime.memory.alloc_root()
  runtime.memory.copy_value(root, value)
  runtime.realm.intrinsics.set(name, root)
  const field = PROTOTYPE_FIELDS[name as keyof typeof PROTOTYPE_FIELDS]
  if (field) runtime.realm[field] = root
}

/** Allocates the symbols and property keys the VM uses directly. */
export function create_well_known_values(runtime: Runtime) {
  const { memory, realm } = runtime
  const description = memory.alloc_root()
  try {
    for (const name of WELL_KNOWN_SYMBOLS) {
      const symbol = memory.alloc_root()
      write_string(memory, description, `Symbol.${name}`)
      create_symbol(memory, symbol, description)
      realm.well_known_symbols.set(name, symbol)
    }
  } finally {
    memory.free_root(description)
  }
  for (const name of PROPERTY_NAMES) {
    const root = memory.alloc_root()
    write_string(memory, root, name)
    realm.property_names.set(name, root)
  }
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
const ROOTS = ["%Object.prototype%", "%Function.prototype%"]

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
    const object = runtime.memory.alloc_root()
    try {
      allocate(runtime, object, declaration.object)
      initialize_binding(runtime, module.environment, declaration.slot, object)
      set_realm_intrinsic(runtime, name, object)
    } finally {
      runtime.memory.free_root(object)
    }
  }
}

function rank(name: string) {
  const index = ROOTS.indexOf(name)
  return index === -1 ? ROOTS.length : index
}

function allocate(
  runtime: Runtime,
  destination: Root,
  kind: Extract<RealmDeclaration, { kind: "well_known" }>["object"],
) {
  const { memory } = runtime
  if (kind === "function")
    create_function(runtime, destination, BUILTIN_CODE, 0)
  else if (kind === "array") create_array(runtime, destination, 0)
  else if (kind === "string") {
    const empty = memory.alloc_root()
    try {
      write_string(memory, empty, "")
      create_string_object(runtime, destination, empty)
    } finally {
      memory.free_root(empty)
    }
  } else create_object(runtime, destination)
}
