import type { Expr, Ident, SourceFile } from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import type { Type } from "./type.ts"
import type { PathMap } from "./PathMap.ts"
import type {
  TypeDeclExcludingKind,
  ValueDeclExcludingKind,
} from "./SymbolTable.ts"
import assert from "node:assert"
import { Diagnostics } from "./diagnostics.ts"

export interface TypecheckResult {
  types: Map<Expr, Type>
  diagnostics: Diagnostics
}

export function typecheck(
  source_files: SourceFiles,
  value_bindings: PathMap<
    Map<Ident, ValueDeclExcludingKind<"Import" | "ImportStarAs">>
  >,
  type_bindings: PathMap<
    Map<Ident, TypeDeclExcludingKind<"Import" | "ImportStarAs">>
  >,
): TypecheckResult {
  const diagnostics = new Diagnostics(source_files.fs)
  const types = new Map<Expr, Type>()
  for (const source_file of source_files.values()) {
    const source_file_values = value_bindings.get(source_file.path)
    const source_file_types = type_bindings.get(source_file.path)
    assert(source_file_values)
    assert(source_file_types)
    typecheck_source_file(source_file, source_file_values, source_file_types)
  }
  return {
    diagnostics,
    types,
  }
}

function typecheck_source_file(
  source_file: SourceFile,
  values: Map<Ident, ValueDeclExcludingKind<"Import" | "ImportStarAs">>,
  types: Map<Ident, TypeDeclExcludingKind<"Import" | "ImportStarAs">>,
): void {}
