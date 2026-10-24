import type { FunctionBuilder } from "./compile.ts"
export interface Scope {
  parent: Scope | null
  owner: FunctionBuilder
  bindings: Map<string, Binding>
  private_names?: Map<string, string>
}

export interface Binding {
  name: string
  slot: number
  readonly: boolean
  owner: FunctionBuilder
}

export interface ResolvedBinding extends Binding {
  depth: number
}

// Each function has one heap environment. Lexical scopes assign distinct slots
// within that environment, so captured mutable bindings share the same cell.
export function create_scope(
  parent: Scope | null,
  owner: FunctionBuilder,
): Scope {
  return { parent, owner, bindings: new Map() }
}

export function declare_binding(
  scope: Scope,
  name: string,
  readonly: boolean = false,
): Binding {
  if (scope.bindings.has(name))
    throw new SyntaxError(`Duplicate binding: ${name}`)
  const slot = scope.owner.binding_flags.length
  const binding = { name, slot, readonly, owner: scope.owner }
  scope.owner.binding_flags.push(readonly)
  scope.bindings.set(name, binding)
  return binding
}

export function resolve_binding(
  scope: Scope,
  name: string,
): ResolvedBinding | null {
  const owner = scope.owner
  for (let current: Scope | null = scope; current; current = current.parent) {
    const binding = current.bindings.get(name)
    if (!binding) continue
    let depth = 0
    for (
      let fn: FunctionBuilder | null = owner;
      fn !== binding.owner;
      fn = fn.parent
    ) {
      if (!fn) throw new Error("Invalid lexical environment chain")
      depth++
    }
    return { ...binding, depth }
  }
  return null
}
