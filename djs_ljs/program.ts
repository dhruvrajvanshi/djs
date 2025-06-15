import type { SourceFile } from "djs_ast"

export type Program = {
  source_files: Record<string, SourceFile>
}
