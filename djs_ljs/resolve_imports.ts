import { assert_todo } from "djs_std"
import type {
  TypeDecl,
  TypeDeclExcludingKind,
  ValueDecl,
  ValueDeclExcludingKind,
} from "./SymbolTable.ts"
import { build_source_file_symbol_table } from "./build_symbol_table.ts"

export function resolve_value_import(
  name: string,
  decl: ValueDecl,
): ValueDeclExcludingKind<"Import" | "ImportStarAs"> {
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  const symbol_table = build_source_file_symbol_table(decl.imported_from)
  const resolved_decl = symbol_table.get_value(name)
  assert_todo(resolved_decl)
  assert_todo(
    resolved_decl.kind !== "Import" && resolved_decl.kind !== "ImportStarAs",
  )
  return resolved_decl
}

export function resolve_type_import(
  name: string,
  decl: TypeDecl,
): TypeDeclExcludingKind<"Import" | "ImportStarAs"> {
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  const symbol_table = build_source_file_symbol_table(decl.imported_from)
  const resolved_decl = symbol_table.get_type(name)
  assert_todo(resolved_decl)
  assert_todo(
    resolved_decl.kind !== "Import" && resolved_decl.kind !== "ImportStarAs",
  )
  return resolved_decl
}
