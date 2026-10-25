import type { Runtime, ModuleRecord } from "./modules.ts"
import type { RealmDeclaration } from "../compiler/compile.ts"
import type { Root } from "../vm/memory.ts"
import { alloc_root, free_root } from "../vm/memory.ts"
import { write_string } from "../vm/values.ts"
import {
  create_object,
  create_function,
  create_array,
  create_string_object,
  initialize_binding,
} from "../vm/objects.ts"
import { BUILTIN_CODE, set_realm_intrinsic } from "../vm/intrinsics.ts"

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
  for (const module of runtime.modules)
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
      const scope = runtime.scopes[module.scope_id]
      ;(scope.intrinsic_bindings ??= new Map()).set(declaration.slot, name)
      continue
    }
    const object = alloc_root(runtime.memory)
    try {
      allocate(runtime, object, declaration.object)
      initialize_binding(runtime, module.environment, declaration.slot, object)
      set_realm_intrinsic(runtime, name, object)
    } finally {
      free_root(runtime.memory, object)
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
  if (kind === "function") create_function(memory, destination, BUILTIN_CODE, 0)
  else if (kind === "array") create_array(memory, destination, 0)
  else if (kind === "string") {
    const empty = alloc_root(memory)
    try {
      write_string(memory, empty, "")
      create_string_object(memory, destination, empty)
    } finally {
      free_root(memory, empty)
    }
  } else create_object(memory, destination)
}
