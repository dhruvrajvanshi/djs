import type { Expr, SourceFile, Stmt } from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import type { Type } from "./type.ts"
import { Diagnostics } from "./diagnostics.ts"
import { todo } from "djs_std"

export interface TypecheckResult {
  types: Map<Expr, Type>
  diagnostics: Diagnostics
  trace: Trace
}

interface TraceNode {
  name: string
}
class Trace {
  root: TraceNode = { name: "root" }
  current: TraceNode = this.root
  nodes = new Set<TraceNode>([this.root])
  edges: [from: TraceNode, to: TraceNode][] = []

  add(name: string) {
    const node: TraceNode = { name }
    this.nodes.add(node)
    this.edges.push([this.current, node])
    const old_current = this.current
    this.current = node
    const self = this
    return {
      [Symbol.dispose]() {
        self.current = old_current
      },
    }
  }
}

export function typecheck(source_files: SourceFiles): TypecheckResult {
  const diagnostics = new Diagnostics(source_files.fs)
  const types = new Map<Expr, Type>()
  const trace = new Trace()

  for (const file of source_files.values()) {
    check_source_file(file)
  }

  return {
    diagnostics,
    types,
    trace,
  }

  function check_source_file(file: SourceFile): void {
    using _ = trace.add(`check_source_file(${file.path})`)
    for (const stmt of file.stmts) {
      check_stmt(stmt)
    }
  }
  function check_stmt(stmt: Stmt): void {
    using _ = trace.add(`check_stmt(${short_stmt_name(stmt)})`)
    switch (stmt.kind) {
      case "Import":
        return check_import_stmt(stmt)
      case "ImportStarAs":
        return check_import_star_as_stmt(stmt)
      case "TypeAlias":
        return check_type_alias_stmt(stmt)
      default:
        todo(stmt.kind)
    }
  }

  function check_import_stmt(stmt: Stmt): void {
    using _ = trace.add(`check_import_stmt`)
  }
  function check_import_star_as_stmt(stmt: Stmt): void {
    using _ = trace.add(`check_import_star_as_stmt`)
  }
  function check_type_alias_stmt(stmt: Stmt): void {
    using _ = trace.add(`check_type_alias_stmt`)
  }
}

function short_stmt_name(stmt: Stmt): string {
  return stmt.kind
}
