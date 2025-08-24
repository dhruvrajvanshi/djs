import { assert_never, MapUtils, todo } from "djs_std"
import type {
  TypeDecl,
  TypeDeclExcludingKind,
  ValueDecl,
  ValueDeclExcludingKind,
} from "./SymbolTable.ts"
import type { ResolveResult } from "./resolve.ts"
import { PathMap } from "./PathMap.ts"
import type { Ident } from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { build_source_file_symbol_table } from "./build_symbol_table.ts"

export interface ResolveImportsResult {
  values: PathMap<Map<Ident, ValueDeclExcludingKind<"Import" | "ImportStarAs">>>
  types: PathMap<Map<Ident, TypeDeclExcludingKind<"Import" | "ImportStarAs">>>
}
interface ResolveImportsArgs {
  types: PathMap<Map<Ident, TypeDecl>>
  values: PathMap<Map<Ident, ValueDecl>>
}

export function resolve_imports(
  source_files: SourceFiles,
  { types, values }: ResolveImportsArgs,
): ResolveImportsResult {
  const resolved_values = values.map_values((file_values) =>
    MapUtils.map_values(file_values, (decl, name) =>
      resolve_value_import(source_files, name.text, decl),
    ),
  )
  const resolved_types = types.map_values((file_types) =>
    MapUtils.map_values(file_types, (decl, name) =>
      resolve_type_import(source_files, name.text, decl),
    ),
  )
  return {
    values: resolved_values,
    types: resolved_types,
  }
}

function resolve_value_import(
  source_files: SourceFiles,
  name: string,
  decl: ValueDecl,
): ValueDeclExcludingKind<"Import" | "ImportStarAs"> {
  // Because this function is recursively called, it needs a base
  // case.
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  switch (decl.kind) {
    case "Import": {
      const source_file = source_files.get(decl.imported_file)
      if (!source_file) todo()
      const symbol_table = build_source_file_symbol_table(source_file)
      const value = symbol_table.get_value(name)
      if (!value) todo()
      return resolve_value_import(source_files, name, value)
    }
    case "ImportStarAs": {
      const source_file = source_files.get(decl.imported_file)
      if (!source_file) todo()
      const symbol_table = build_source_file_symbol_table(source_file)
      const values = [...symbol_table.value_entries()]
      return {
        kind: "Module",
        path: decl.imported_file,
        values: new Map(
          values.map(([name, decl]) => [
            name,
            resolve_value_import(source_files, name, decl),
          ]),
        ),
      }
    }
    default:
      assert_never(decl)
  }
}

function resolve_type_import(
  source_files: SourceFiles,
  name: string,
  decl: TypeDecl,
): TypeDeclExcludingKind<"Import" | "ImportStarAs"> {
  // Because this function is recursively called, it needs a base
  // case.
  if (decl.kind !== "Import" && decl.kind !== "ImportStarAs") {
    return decl
  }
  switch (decl.kind) {
    case "Import": {
      const source_file = source_files.get(decl.imported_file)
      if (!source_file) todo()
      const symbol_table = build_source_file_symbol_table(source_file)
      const type = symbol_table.get_type(name)
      if (!type) todo()
      return resolve_type_import(source_files, name, type)
    }
    case "ImportStarAs": {
      const source_file = source_files.get(decl.imported_file)
      if (!source_file) todo()
      const symbol_table = build_source_file_symbol_table(source_file)
      const types = [...symbol_table.type_entries()]
      return {
        kind: "Module",
        path: decl.imported_file,
        types: new Map(
          types.map(([name, decl]) => [
            name,
            resolve_type_import(source_files, name, decl),
          ]),
        ),
      }
    }
    default:
      assert_never(decl)
  }
}
