import { type Ident, type TypeAnnotation } from "djs_ast"
import { Type } from "./type.ts"
import { todo } from "djs_std"

export type TypeVarEnv = (name: Ident | readonly Ident[]) => Type

export function annotation_to_type(
  env: TypeVarEnv,
  annotation: TypeAnnotation,
): Type {
  switch (annotation.kind) {
    case "Ident":
      switch (annotation.ident.text) {
        case "u32":
          return Type.u32
        default:
          return env(annotation.ident)
      }
    case "LJSMutPtr":
      return Type.MutPtr(annotation_to_type(env, annotation.to))
    case "LJSPtr":
      return Type.Ptr(annotation_to_type(env, annotation.to))
    case "Qualified":
      return env([annotation.head, ...annotation.tail])
    case "Builtin":
      switch (annotation.text) {
        case '"c_char"':
          return Type.c_char
        case '"c_int"':
          return Type.c_int
        default:
          todo(annotation.text)
      }
    default:
      return todo(annotation.kind)
  }
}
