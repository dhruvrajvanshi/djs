export interface QualifiedName extends ReadonlyArray<string> {
  __kind__: typeof QualifiedNameKind | undefined
}

export function QualifiedName(...parts: readonly string[]): QualifiedName {
  return parts as QualifiedName
}

QualifiedName.is_entry = (self: QualifiedName) => {
  return self.length === 0
}

QualifiedName.append = (base: QualifiedName, ...parts: readonly string[]) => {
  return QualifiedName(...base, ...parts)
}

const QualifiedNameKind: unique symbol = Symbol("QualifiedName")
