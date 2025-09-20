export type QualifiedName = {
  __kind__: "__QualifiedName__" | undefined
}

export function QualifiedName(...parts: string[]): QualifiedName {
  return parts.join(".") as never as QualifiedName
}

const QualifiedNameKind: unique symbol = Symbol("QualifiedName")
