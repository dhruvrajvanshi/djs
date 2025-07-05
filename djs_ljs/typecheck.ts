import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"
import type { SourceFiles } from "./SourceFiles.ts"

export interface TypeCheckResult {
  diagnostics: Diagnostics
}
export function typecheck(source_files: SourceFiles, fs: FS): TypeCheckResult {
  const diagnostics = new Diagnostics(fs)
  const result: TypeCheckResult = {
    diagnostics,
  }
  return result
}
