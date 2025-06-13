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
}
