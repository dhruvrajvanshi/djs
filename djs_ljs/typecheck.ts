import type { Expr } from "djs_ast"
import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"
import type { SourceFiles } from "./SourceFiles.ts"
import type { Type } from "./Type.ts"

export interface TypeCheckResult {
  diagnostics: Diagnostics
  types: Map<Expr, Type>
}
export function typecheck(source_files: SourceFiles, fs: FS): TypeCheckResult {
  const diagnostics = new Diagnostics(fs)
  const result: TypeCheckResult = {
    diagnostics,
    types: new Map<Expr, Type>(),
  }

  return result
}
