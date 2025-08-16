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
  | { kind: "void" }
  | { kind: "boolean" }
  | { kind: "Ptr"; type: Type }
  | { kind: "MutPtr"; type: Type }
  | { kind: "UnboxedFunc"; params: readonly Type[]; return_type: Type }
  | { kind: "Error"; message: string }
  /**
   * typeof @builtin("c_str")
   * Takes a constant tagged template argument and returns a pointer to a null-terminated C string.
   */
  | { kind: "CStringConstructor" }
>
export const Type = {
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
  void: { kind: "void" },
  c_char: { kind: "c_char" },
  boolean: { kind: "boolean" },

  Ptr: (type: Type) => ({ kind: "Ptr", type }),
  MutPtr: (type: Type) => ({ kind: "MutPtr", type }),
  UnboxedFunc: (params: readonly Type[], return_type: Type) => ({
    kind: "UnboxedFunc",
    params,
    return_type,
  }),
  CStringConstructor: { kind: "CStringConstructor" },
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
    case "UnboxedFunc":
      const params = type.params.map(type_to_string).join(", ")
      return `(${params}) => ${type_to_string(type.return_type)}`
    case "Error":
      return "<Error>"
    case "void":
      return "void"
    case "CStringConstructor":
      return "`` => *c_str"
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
    case "void":
      return "void"
    case "Ptr":
      return `(* ${type_to_sexpr(type.type)})`
    case "MutPtr":
      return `(*mut ${type_to_sexpr(type.type)})`
    case "UnboxedFunc":
      const params = type.params.map(type_to_sexpr).join(" ")
      return `((${params}) => ${type_to_sexpr(type.return_type)})`

    case "CStringConstructor":
      return "`` => *c_str"
    case "Error":
      return `<Error: ${type.message}>`
    default:
      return assert_never(type)
  }
}
