import { assert_never, type ReadonlyUnion } from "djs_std"

export type Type = ReadonlyUnion<
  | { kind: "Forall"; params: readonly TypeParam[]; body: Type }
  | { kind: "ParamRef"; name: string }
  /**
   * Top type: Every type is assignable to this type.
   */
  | { kind: "unknown" }
  | { kind: "boolean" }
  | { kind: "Error"; message: string }
>
export type TypeParam = Readonly<{
  name: string
}>

export const Type = {
  boolean: { kind: "boolean" },
  unknown: { kind: "unknown" },
  Forall: (params: readonly TypeParam[], body: Type) => ({
    kind: "Forall",
    params,
    body,
  }),
  ParamRef: (name: string) => ({ kind: "ParamRef", name }),
  Error: (message: string) => ({ kind: "Error", message }),
} satisfies Record<string, Type | ((...args: readonly never[]) => Type)>

export function type_to_string(type: Type): string {
  switch (type.kind) {
    case "Error":
      return "<Error>"
    case "Forall":
      return `forall ${type.params.map((p) => p.name).join(", ")}. ${type_to_string(type.body)}`
    case "ParamRef":
      return type.name
    case "unknown":
      return "unknown"
    case "boolean":
      return "boolean"
    default:
      return assert_never(type)
  }
}
export function type_to_sexpr(type: Type): string {
  switch (type.kind) {
    case "Error":
      return `<Error: ${type.message}>`
    case "Forall":
      return `(Forall (${type.params
        .map((p) => p.name)
        .join(" ")}) ${type_to_sexpr(type.body)})`
    case "ParamRef":
      return `(ParamRef ${type.name})`
    case "unknown":
      return "unknown"
    case "boolean":
      return "boolean"
    default:
      return assert_never(type)
  }
}
export function type_is_integral(_type: Type): boolean {
  return false
}
export function type_is_floating_point(type: Type): boolean {
  return false
}
export function type_is_convertible_from_numeric_literal(
  type: Type,
  literal: string,
): boolean {
  if (type.kind === "unknown") return true
  if (type_is_integral(type)) {
    return Number.isInteger(parseInt(literal))
  }
  if (type_is_floating_point(type)) {
    return !Number.isNaN(parseFloat(literal))
  }
  return false
}

export function type_is_one_of<Kinds extends readonly Type["kind"][]>(
  type: Type,
  ...kinds: Kinds
): type is Extract<Type, { kind: Kinds[number] }> {
  return kinds.includes(type.kind)
}
