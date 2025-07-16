import type {
  FuncStmt,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  SourceFile,
  Stmt,
  TypeAliasStmt,
  VarDeclStmt,
} from "djs_ast"
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
      case "ImportStarAs":
        return import_star_as_stmt_diagnostics(stmt)
      case "Import":
        return import_stmt_diagnostics(stmt)
      case "Func":
        return func_stmt_diagnostics(stmt)
      case "LJSExternFunction":
        return ljs_extern_function_stmt_diagnostics(stmt)
      case "VarDecl":
        return var_decl_stmt_diagnostics(stmt)
      case "TypeAlias":
        return type_alias_stmt_diagnostics(stmt)
      default:
        todo(stmt.kind)
    }
  }
  function import_star_as_stmt_diagnostics(stmt: ImportStarAsStmt) {}
  function import_stmt_diagnostics(stmt: ImportStmt) {}
  function func_stmt_diagnostics(stmt: FuncStmt) {}
  function ljs_extern_function_stmt_diagnostics(stmt: LJSExternFunctionStmt) {}
  function var_decl_stmt_diagnostics(stmt: VarDeclStmt) {}
  function type_alias_stmt_diagnostics(stmt: TypeAliasStmt) {}
}
