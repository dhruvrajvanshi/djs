import { todo } from "djs_std"
import type {
  TypeDecl,
  TypeDeclExcludingKind,
  ValueDecl,
  ValueDeclExcludingKind,
} from "./SymbolTable.ts"

export function resolve_value_import(
  decl: ValueDecl,
): ValueDeclExcludingKind<"Import" | "ImportStarAs"> {
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  todo()
}

export function resolve_type_import(
  name: string,
  decl: TypeDecl,
): TypeDeclExcludingKind<"Import" | "ImportStarAs"> {
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  todo()
}
