import {
  type_annotation_to_sexpr,
  type Ident,
  type TypeAnnotation,
} from "djs_ast"
import { Type } from "./type.ts"
import { todo } from "djs_std"

export function annotation_to_type(
  env: (name: Ident | readonly [Ident, ...Ident[]]) => Type,
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
    case "LJSConstPtr":
      return Type.Ptr(annotation_to_type(env, annotation.to))
    case "LJSPtr":
      return Type.MutPtr(annotation_to_type(env, annotation.to))
    case "Qualified":
      return env([annotation.head, ...annotation.tail])
    default:
      return todo(annotation.kind)
  }
}
