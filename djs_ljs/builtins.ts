import type { TypeDecl, ValueDecl } from "./SymbolTable.ts"
import { Type } from "./type.ts"

type BuiltinConstDecl = Extract<ValueDecl, { kind: "BuiltinConst" }>
type BuiltinConstName = BuiltinConstDecl["name"]

export const builtin_values: Record<BuiltinConstName, BuiltinConstDecl> = {
  linkc: { kind: "BuiltinConst", name: "linkc", type: Type.BuiltinLinkC },
  uninitialized: {
    kind: "BuiltinConst",
    name: "uninitialized",
    type: Type.Uninitialized,
  },
  transmute: {
    kind: "BuiltinConst",
    name: "transmute",
    type: Type.Forall(
      [{ name: "To" }, { name: "From" }],
      Type.UnboxedFunc([Type.ParamRef("From")], Type.ParamRef("To")),
    ),
  },
  c_str: {
    kind: "BuiltinConst",
    name: "c_str",
    type: Type.CStringConstructor,
  },
}

type BuiltinTypeDecl = Extract<TypeDecl, { kind: "BuiltinType" }>
type BuiltinTypeName = BuiltinTypeDecl["name"]
export const builtin_types: Record<BuiltinTypeName, BuiltinTypeDecl> = {
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
}
