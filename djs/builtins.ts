import { Type } from "./type.ts"

export type BuiltinConstDecl = ValueOf<typeof builtin_values>
export const builtin_values = {
  linkc: { kind: "BuiltinConst", name: "linkc", type: Type.BuiltinLinkC },
  uninitialized: {
    kind: "BuiltinConst",
    name: "uninitialized",
    type: Type.Uninitialized,
  },
  c_str: {
    kind: "BuiltinConst",
    name: "c_str",
    type: Type.CStringConstructor,
  },
  cast: {
    kind: "BuiltinConst",
    name: "cast",
    type: Type.Forall(
      [{ name: "To" }],
      Type.UnboxedFunc([Type.Unknown], Type.ParamRef("To")),
    ),
  },
  size_of: {
    kind: "BuiltinConst",
    name: "size_of",
    type: Type.Forall([{ name: "T" }], Type.UnboxedFunc([], Type.usize)),
  },
} as const

export type BuiltinTypeDecl = ValueOf<typeof builtin_types>
export const builtin_types = {
  c_char: {
    kind: "BuiltinType",
    name: "c_char",
    type: Type.c_char,
  },
  c_int: {
    kind: "BuiltinType",
    name: "c_int",
    type: Type.c_int,
  },
} as const

type ValueOf<T> = T[keyof T]
