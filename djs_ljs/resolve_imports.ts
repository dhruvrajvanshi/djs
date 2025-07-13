import { todo } from "djs_std"
import type { SourceFiles } from "./SourceFiles.ts"
import type { PathMap } from "./PathMap.ts"
import type { SymbolTable } from "./SymbolTable.ts"

export interface ResolveImportsResult {}
export function resolve_imports(
  source_files: SourceFiles,
  symbol_tables: PathMap<SymbolTable>,
): ResolveImportsResult {
  todo()
}
