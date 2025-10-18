import assert from "node:assert"

export type QualifiedName = {
  __kind__: "__QualifiedName__" | undefined
}

export function QualifiedName(...parts: string[]): QualifiedName {
  return parts.join(".") as never as QualifiedName
}

QualifiedName.append = (base: QualifiedName, ...parts: string[]) => {
  const s = base as unknown
  assert(typeof s === "string")
  return QualifiedName(...s.split("."), ...parts)
}
QualifiedName.to_array = (name: QualifiedName): string[] => {
  const s = name as unknown
  assert(typeof s === "string")
  return s.split(".")
}

const QualifiedNameKind: unique symbol = Symbol("QualifiedName")
