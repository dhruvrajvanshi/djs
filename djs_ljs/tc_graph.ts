import type { SourceFile, Stmt } from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { DirectedGraph } from "./DiredctedGraph.ts"
import { todo } from "djs_std"

type TCNode =
  | { kind: "SourceFileDiagnostics"; file: SourceFile }
  | { kind: "StmtDiagnostics"; stmt: Stmt }

export function build_tc_graph(source_files: SourceFiles) {
  const graph = DirectedGraph.builder<TCNode>()
  for (const source_file of source_files.values()) {
    source_file_diagnostics(source_file)
  }

  function source_file_diagnostics(source_file: SourceFile) {
    using _ = graph.add_child({
      kind: "SourceFileDiagnostics",
      file: source_file,
    })
    for (const stmt of source_file.stmts) {
      stmt_diagnostics(stmt)
    }
  }

  function stmt_diagnostics(stmt: Stmt) {
    using _ = graph.add_child({ kind: "StmtDiagnostics", stmt })
    switch (stmt.kind) {
      default:
        todo(stmt.kind)
    }
  }
}
