<<<<<<< HEAD
import { assert_never, type ReadonlyUnion } from "djs_std"

export type Type = ReadonlyUnion<
  | { kind: "u8" }
  | { kind: "u16" }
  | { kind: "u32" }
  | { kind: "u64" }
  | { kind: "i8" }
  | { kind: "i16" }
  | { kind: "i32" }
  | { kind: "i64" }
  | { kind: "f32" }
  | { kind: "f64" }
  | { kind: "c_char" }
  | { kind: "boolean" }
  | { kind: "Ptr"; type: Type }
  | { kind: "MutPtr"; type: Type }
>
export const Type = {
=======
import { type Prettify } from "djs_std"
export type PrimitiveKind = (typeof PrimitiveKindsList)[number]

const PrimitiveKindsList = [
  "u8",
  "u16",
  "u32",
  "u64",
  "i8",
  "i16",
  "i32",
  "i64",
  "f32",
  "f64",
  "boolean",
] as const

const PrimitiveTypes = {
>>>>>>> 879a0f1 ([ljs] [type]: Add types.ts)
  u8: { kind: "u8" },
  u16: { kind: "u16" },
  u32: { kind: "u32" },
  u64: { kind: "u64" },
  i8: { kind: "i8" },
  i16: { kind: "i16" },
  i32: { kind: "i32" },
  i64: { kind: "i64" },
  f32: { kind: "f32" },
  f64: { kind: "f64" },
<<<<<<< HEAD
  c_char: { kind: "c_char" },
  boolean: { kind: "boolean" },

  Ptr: (type: Type) => ({ kind: "Ptr", type }) as const,
  MutPtr: (type: Type) => ({ kind: "MutPtr", type }) as const,
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
    case "i8":
      return "i8"
    case "i16":
      return "i16"
    case "i32":
      return "i32"
    case "i64":
      return "i64"
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
    default:
      return assert_never(type)
  }
=======
  boolean: { kind: "boolean" },
} satisfies Record<PrimitiveKind, PrimitiveType>

export interface PrimitiveType {
  readonly kind: PrimitiveKind
}

export interface PtrType {
  readonly kind: "ptr"
  readonly is_const: boolean
  readonly to: Type
}

export type Type = Prettify<PrimitiveType | PtrType>

export const Type = {
  ...PrimitiveTypes,
  ptr: (is_const: boolean, to: Type): PtrType => ({
    kind: "ptr",
    is_const,
    to,
  }),
>>>>>>> 879a0f1 ([ljs] [type]: Add types.ts)
}
