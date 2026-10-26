import type { FunctionBuilder } from "./compile.ts"
export interface Scope {
  parent: Scope | null
  owner: FunctionBuilder
  environment: Environment
  bindings: Map<string, Binding>
  private_names?: Map<string, string>
}

export interface Environment {
  binding_flags: boolean[]
}

/** Variables no closure captures get a `register`, and no slot. */
export interface Binding {
  name: string
  slot: number
  register: number | null
  readonly: boolean
  owner: FunctionBuilder
  /**
   * For registers: whether code compiled from here on runs after the
   * declaration. Code before it can only run in the temporal dead zone.
   */
  initialized: boolean
}

export interface ResolvedBinding extends Binding {
  depth: number
}

// Each function has one heap environment. Lexical scopes assign distinct slots
// within that environment, so captured mutable bindings share the same cell.
// Scopes inside loops may get their own environment so each iteration gets
// fresh bindings.
export function create_scope(
  parent: Scope | null,
  owner: FunctionBuilder,
  environment: Environment = parent?.owner === owner
    ? parent.environment
    : owner,
): Scope {
  return { parent, owner, environment, bindings: new Map() }
}

export function declare_binding(
  scope: Scope,
  name: string,
  readonly: boolean = false,
  register: number | null = null,
): Binding {
  if (scope.bindings.has(name))
    throw new SyntaxError(`Duplicate binding: ${name}`)
  const slot = register === null ? scope.environment.binding_flags.length : -1
  const binding = {
    name,
    slot,
    register,
    readonly,
    owner: scope.owner,
    initialized: false,
  }
  if (register === null) scope.environment.binding_flags.push(readonly)
  scope.bindings.set(name, binding)
  return binding
}

export function resolve_binding(
  scope: Scope,
  name: string,
): ResolvedBinding | null {
  let depth = 0
  for (let current: Scope | null = scope; current; current = current.parent) {
    const binding = current.bindings.get(name)
    if (binding) return { ...binding, depth }
    if (current.parent && current.parent.environment !== current.environment)
      depth++
  }
  return null
}
