import { ASTVisitorBase, type Expr } from "djs_ast"
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
  const typecheck_visitor = new TypecheckVisitor()
  typecheck_visitor.visit_source_files(source_files)

  return result
}

class TypecheckVisitor extends ASTVisitorBase {
  private readonly visited_source_files: Set<string> = new Set()
  public readonly types: Map<Expr, Type> = new Map()

  visit_source_files(source_files: SourceFiles): void {
    for (const source_file of source_files.values()) {
      if (this.visited_source_files.has(source_file.path)) {
        continue
      }
      this.visited_source_files.add(source_file.path)
      this.visit_source_file(source_file)
    }
  }

  override visit_expr(expr: Expr): void {
    const existing = this.types.get(expr)
    if (existing) return

    switch (expr.kind) {
      default:
        super.visit_expr(expr)
    }
  }
}
