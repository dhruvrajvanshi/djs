import { assert_never, type ReadonlyUnion } from "djs_std"

export type Type = ReadonlyUnion<
  | { kind: "u8" }
  | { kind: "u16" }
  | { kind: "u32" }
  | { kind: "u64" }
  | { kind: "usize" }
  | { kind: "i8" }
  | { kind: "i16" }
  | { kind: "i32" }
  | { kind: "i64" }
  | { kind: "isize" }
  | { kind: "f32" }
  | { kind: "f64" }
  | { kind: "c_int" }
  | { kind: "c_char" }
  | { kind: "void" }
  | { kind: "boolean" }
  | { kind: "Ptr"; type: Type }
  | { kind: "MutPtr"; type: Type }
  | { kind: "FixedSizeArray"; element_type: Type; size: number }
  | {
      kind: "UnboxedFunc"
      params: readonly Type[]
      return_type: Type
      is_vararg: boolean
    }
  | { kind: "BuiltinLinkC" }
  | { kind: "BuiltinUninitialized" }
  | { kind: "Opaque"; qualified_name: readonly string[] }
  | { kind: "Forall"; params: readonly TypeParam[]; body: Type }
  | { kind: "ParamRef"; name: string }
  /**
   * Top type: Every type is assignable to this type.
   */
  | { kind: "unknown" }
  | StructConstructorType
  | StructInstanceType
  | UntaggedUnionConstructorType
  | UntaggedUnionInstanceType
  | { kind: "Error"; message: string }
  /**
   * typeof @builtin("c_str")
   * Takes a constant tagged template argument and returns a pointer to a null-terminated C string.
   */
  | { kind: "CStringConstructor" }
>
export type TypeParam = Readonly<{
  name: string
}>
/**
 * In an expression SomeStruct { field: value, ...}
 * this represents the type of SomeStruct
 */
type StructConstructorType = Readonly<{
  kind: "StructConstructor"
  qualified_name: readonly string[]
  fields: Record<string, Type>
}>
export type StructInstanceType = Readonly<{
  kind: "StructInstance"
  qualified_name: readonly string[]
  fields: Record<string, Type>
}>
/**
 * In an expression SomeUnion { variant: value }
 * this represents the type of SomeUnion
 */
type UntaggedUnionConstructorType = Readonly<{
  kind: "UntaggedUnionConstructor"
  qualified_name: readonly string[]
  variants: Record<string, Type>
}>
export type UntaggedUnionInstanceType = Readonly<{
  kind: "UntaggedUnionInstance"
  qualified_name: readonly string[]
  variants: Record<string, Type>
}>
export const Type = {
  u8: { kind: "u8" },
  u16: { kind: "u16" },
  u32: { kind: "u32" },
  u64: { kind: "u64" },
  usize: { kind: "usize" },
  i8: { kind: "i8" },
  i16: { kind: "i16" },
  i32: { kind: "i32" },
  i64: { kind: "i64" },
  isize: { kind: "isize" },
  f32: { kind: "f32" },
  f64: { kind: "f64" },
  void: { kind: "void" },
  c_char: { kind: "c_char" },
  c_int: { kind: "c_int" },
  boolean: { kind: "boolean" },

  Ptr: (type: Type) => ({ kind: "Ptr", type }),
  MutPtr: (type: Type) => ({ kind: "MutPtr", type }),
  FixedSizeArray: (element_type: Type, size: number) => ({
    kind: "FixedSizeArray",
    element_type,
    size,
  }),
  Forall: (params: readonly TypeParam[], body: Type) => ({
    kind: "Forall",
    params,
    body,
  }),
  ParamRef: (name: string) => ({ kind: "ParamRef", name }),
  UnboxedFunc: (
    params: readonly Type[],
    return_type: Type,
    is_vararg = false,
  ) => ({
    kind: "UnboxedFunc",
    params,
    return_type,
    is_vararg,
  }),
  CStringConstructor: { kind: "CStringConstructor" },
  StructConstructor: (
    name: readonly string[],
    fields: Record<string, Type>,
  ) => ({
    kind: "StructConstructor",
    qualified_name: name,
    fields,
  }),
  StructInstance: (name: readonly string[], fields: Record<string, Type>) => ({
    kind: "StructInstance",
    qualified_name: name,
    fields,
  }),
  UntaggedUnionConstructor: (
    name: readonly string[],
    variants: Record<string, Type>,
  ) => ({
    kind: "UntaggedUnionConstructor",
    qualified_name: name,
    variants,
  }),
  UntaggedUnionInstance: (
    name: readonly string[],
    variants: Record<string, Type>,
  ) => ({
    kind: "UntaggedUnionInstance",
    qualified_name: name,
    variants,
  }),
  Opaque: (name: readonly string[]) => ({
    kind: "Opaque",
    qualified_name: name,
  }),
  BuiltinLinkC: {
    kind: "BuiltinLinkC",
  },
  Uninitialized: {
    kind: "BuiltinUninitialized",
  },
  Unknown: {
    kind: "unknown",
  },
  Error: (message: string) => ({ kind: "Error", message }),
} satisfies Record<string, Type | ((...args: readonly never[]) => Type)>

export function type_to_string(type: Type): string {
  switch (type.kind) {
    case "u8":
      return "u8"
    case "u16":
      return "u16"
    case "u32":
      return "u32"
    case "u64":
      return "u64"
    case "usize":
      return "usize"
    case "i8":
      return "i8"
    case "i16":
      return "i16"
    case "i32":
      return "i32"
    case "i64":
      return "i64"
    case "isize":
      return "isize"
    case "f32":
      return "f32"
    case "f64":
      return "f64"
    case "c_char":
      return "c_char"
    case "boolean":
      return "boolean"
    case "Ptr":
      return `*${type_to_string(type.type)}`
    case "MutPtr":
      return `*mut ${type_to_string(type.type)}`
    case "FixedSizeArray":
      return `${type_to_string(type.element_type)}[${type.size}]`
    case "UnboxedFunc":
      const params = type.params.map(type_to_string).join(", ")
      const paramsList = type.is_vararg
        ? `${params}${params ? ", " : ""}...`
        : params
      return `(${paramsList}) => ${type_to_string(type.return_type)}`
    case "Error":
      return "<Error>"
    case "void":
      return "void"
    case "CStringConstructor":
      return "`` => *c_str"
    case "c_int":
      return "c_int"
    case "StructConstructor":
      return (
        `{ ${Object.entries(type.fields)
          .map((it) => `${it[0]}: ${type_to_string(it[1])}`)
          .join(", ")} } =>` + type.qualified_name.join(".")
      )
    case "StructInstance":
      return type.qualified_name.join(".")
    case "UntaggedUnionConstructor":
      return (
        `{ ${Object.entries(type.variants)
          .map((it) => `${it[0]}: ${type_to_string(it[1])}`)
          .join(" | ")} } =>` + type.qualified_name.join(".")
      )
    case "UntaggedUnionInstance":
      return type.qualified_name.join(".")
    case "BuiltinLinkC":
      return "ljs:builtin/linkc"
    case "Opaque":
      return type.qualified_name.join(".")
    case "BuiltinUninitialized":
      return "<uninitialized>"
    case "Forall":
      return `forall ${type.params.map((p) => p.name).join(", ")}. ${type_to_string(type.body)}`
    case "ParamRef":
      return type.name
    case "unknown":
      return "unknown"
    default:
      return assert_never(type)
  }
}
export function type_to_sexpr(type: Type): string {
  switch (type.kind) {
    case "u8":
      return "u8"
    case "u16":
      return "u16"
    case "u32":
      return "u32"
    case "u64":
      return "u64"
    case "usize":
      return "usize"
    case "i8":
      return "i8"
    case "i16":
      return "i16"
    case "i32":
      return "i32"
    case "i64":
      return "i64"
    case "isize":
      return "isize"
    case "f32":
      return "f32"
    case "f64":
      return "f64"
    case "c_char":
      return "c_char"
    case "boolean":
      return "boolean"
    case "void":
      return "void"
    case "Ptr":
      return `(* ${type_to_sexpr(type.type)})`
    case "MutPtr":
      return `(*mut ${type_to_sexpr(type.type)})`
    case "FixedSizeArray":
      return `(FixedSizeArray ${type_to_sexpr(type.element_type)} ${type.size})`
    case "UnboxedFunc":
      const params = type.params.map(type_to_sexpr).join(" ")
      const paramsList = type.is_vararg
        ? `${params}${params ? " " : ""}...`
        : params
      return `((${paramsList}) => ${type_to_sexpr(type.return_type)})`

    case "CStringConstructor":
      return "`` => *c_str"
    case "c_int":
      return "c_int"
    case "StructConstructor": {
      return `(StructConstructor ${type.qualified_name.join(".")} { ${Object.entries(
        type.fields,
      )
        .map(
          ([field, field_type]) => `(${field} . ${type_to_sexpr(field_type)})`,
        )
        .join(" ")} })`
    }
    case "StructInstance": {
      return `(StructInstance ${type.qualified_name.join(".")} { ${Object.entries(
        type.fields,
      )
        .map(
          ([field, field_type]) => `(${field} . ${type_to_sexpr(field_type)})`,
        )
        .join(" ")} })`
    }
    case "Error":
      return `<Error: ${type.message}>`
    case "BuiltinLinkC":
      return "ljs:builtin/linkc"
    case "Opaque":
      return `(Opaque ${type.qualified_name.join(".")})`
    case "UntaggedUnionConstructor":
      return `(UntaggedUnionConstructor ${type.qualified_name.join(".")} ${Object.entries(
        type.variants,
      )
        .map(
          ([name, variant_type]) => `(${name} ${type_to_sexpr(variant_type)})`,
        )
        .join(" ")})`
    case "UntaggedUnionInstance":
      return `(UntaggedUnionInstance ${type.qualified_name.join(".")})`
    case "BuiltinUninitialized":
      return "<uninitialized>"
    case "Forall":
      return `(Forall (${type.params
        .map((p) => p.name)
        .join(" ")}) ${type_to_sexpr(type.body)})`
    case "ParamRef":
      return `(ParamRef ${type.name})`
    case "unknown":
      return "unknown"
    default:
      return assert_never(type)
  }
}
export function type_is_integral(type: Type): boolean {
  return (
    type.kind === "u8" ||
    type.kind === "u16" ||
    type.kind === "u32" ||
    type.kind === "u64" ||
    type.kind === "usize" ||
    type.kind === "i8" ||
    type.kind === "i16" ||
    type.kind === "i32" ||
    type.kind === "i64" ||
    type.kind === "isize" ||
    type.kind === "c_int"
  )
}
export function type_is_floating_point(type: Type): boolean {
  return type.kind === "f32" || type.kind === "f64"
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

export function type_is_pointer(
  type: Type,
): type is Extract<Type, { kind: "Ptr" | "MutPtr" }> {
  return type.kind === "Ptr" || type.kind === "MutPtr"
}
