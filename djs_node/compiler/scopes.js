// Each function has one heap environment. Lexical scopes assign distinct slots
// within that environment, so captured mutable bindings share the same cell.
export function create_scope(parent, owner) {
  return { parent, owner, bindings: new Map() }
}

export function declare_binding(scope, name, readonly = false) {
  if (scope.bindings.has(name))
    throw new SyntaxError(`Duplicate binding: ${name}`)
  const slot = scope.owner.binding_flags.length
  const binding = { name, slot, readonly, owner: scope.owner }
  scope.owner.binding_flags.push(readonly)
  scope.bindings.set(name, binding)
  return binding
}

export function resolve_binding(scope, name) {
  const owner = scope.owner
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name)
    if (!binding) continue
    let depth = 0
    for (let fn = owner; fn !== binding.owner; fn = fn.parent) {
      if (!fn) throw new Error("Invalid lexical environment chain")
      depth++
    }
    return { ...binding, depth }
  }
  return null
}
