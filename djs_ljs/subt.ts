import { assert_never, zip } from "djs_std"
import { Type, type TypeParam } from "./type.ts"

export type Subst = Record<string, Type>
export const Subst = {
  EMPTY: {} satisfies Subst,
  of_params(params: readonly TypeParam[]): Subst {
    return Object.fromEntries(
      params.map((param) => [param.name, Type.ParamRef(param.name)]),
    )
  },
  of_application(params: readonly TypeParam[], args: readonly Type[]): Subst {
    const entries = [...zip(params, args)].map(
      ([param, arg]) => [param.name, arg] as const,
    )
    return Object.fromEntries(entries)
  },
  apply(subst: Subst, to: Type): Type {
    return apply_to_type(subst, to)
  },
}
function apply_to_subst(subst: Subst, to: Subst): Subst {
  const result: Subst = {}
  for (const [key, type] of Object.entries(to)) {
    result[key] = apply_to_type(subst, type)
  }
  return result
}
function apply_to_type(subst: Subst, to: Type): Type {
  switch (to.kind) {
    case "ParamRef": {
      const replacement = subst[to.name]
      if (replacement !== undefined) {
        return apply_to_type(subst, replacement)
      } else {
        return to
      }
    }
    case "Forall": {
      // <T>. SomeType<T>
      // In the body of the forall, the T refers to the type param.
      // So we need to remove it from the subst when applying to the body.
      // This is done by `applyToSubst(Subst.of_params(to.params), subst)`
      return Type.Forall(
        to.params,
        apply_to_type(
          apply_to_subst(Subst.of_params(to.params), subst),
          to.body,
        ),
      )
    }
    case "UnboxedFunc":
      return Type.UnboxedFunc(
        to.params.map((param) => apply_to_type(subst, param)),
        apply_to_type(subst, to.return_type),
      )
    case "FixedSizeArray":
      return Type.FixedSizeArray(apply_to_type(subst, to.element_type), to.size)
    case "MutPtr":
      return Type.MutPtr(apply_to_type(subst, to.type))
    case "Ptr":
      return Type.Ptr(apply_to_type(subst, to.type))
    case "StructConstructor":
    case "CStringConstructor":
    case "StructInstance":
    case "UntaggedUnionConstructor":
    case "UntaggedUnionInstance":
    case "Opaque":
    case "BuiltinLinkC":
    case "BuiltinUninitialized":
    case "u8":
    case "u16":
    case "u32":
    case "u64":
    case "i8":
    case "i16":
    case "i32":
    case "i64":
    case "f32":
    case "f64":
    case "boolean":
    case "c_char":
    case "c_int":
    case "void":
    case "unknown":
    case "Error":
      return to
    default:
      assert_never(to)
  }
}
