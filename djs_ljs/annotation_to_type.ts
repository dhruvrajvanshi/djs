import { type Ident, type TypeAnnotation } from "djs_ast"
import { Type } from "./type.ts"
import { TODO } from "djs_std"

export type TypeVarEnv = (name: Ident | readonly Ident[]) => Type

export function annotation_to_type(
  env: TypeVarEnv,
  annotation: TypeAnnotation,
  emit_error_type: (message: string) => Type,
): Type {
  switch (annotation.kind) {
    case "Ident":
      switch (annotation.ident.text) {
        case "u8":
          return Type.u8
        case "u32":
          return Type.u32
        default:
          return env(annotation.ident)
      }
    case "LJSMutPtr":
      return Type.MutPtr(
        annotation_to_type(env, annotation.to, emit_error_type),
      )
    case "LJSPtr":
      return Type.Ptr(annotation_to_type(env, annotation.to, emit_error_type))
    case "FixedSizeArray": {
      const element_type = annotation_to_type(
        env,
        annotation.item,
        emit_error_type,
      )
      if (annotation.size.kind === "Number") {
        const size = parseInt(annotation.size.text)
        if (size > 0 && Number.isInteger(size)) {
          return Type.FixedSizeArray(element_type, size)
        } else {
          return emit_error_type(
            `Array size must be a positive integer, got ${annotation.size.text}`,
          )
        }
      } else {
        return emit_error_type(
          `Array size must be a compile-time constant, got ${annotation.size.kind}`,
        )
      }
    }
    case "Qualified":
      return env([annotation.head, ...annotation.tail])
    case "Builtin":
      switch (annotation.text) {
        case '"c_char"':
          return Type.c_char
        case '"c_int"':
          return Type.c_int
        default:
          TODO(annotation.text)
      }
    default:
      return TODO(annotation.kind)
  }
}
