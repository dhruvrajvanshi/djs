import type {
  FuncStmt,
  Ident,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  SourceFile,
  Stmt,
  TypeAliasStmt,
  VarDeclStmt,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { DirectedGraph, render_graph } from "./DirectedGraph.ts"
import { assert_never, todo } from "djs_std"
import { import_stmt_path } from "./import_stmt_path.ts"
import { relative, resolve } from "path"
import { cwd } from "process"

type TCNode =
  | { kind: "ProgramDiagnostics"; program: SourceFiles }
  | { kind: "SourceFileDiagnostics"; file: SourceFile }
  | { kind: "StmtDiagnostics"; source_file: SourceFile; stmt: Stmt }
  | { kind: "FindDeclInSourceFile"; source_file: SourceFile; name: string }

function tc_node_attrs(node: TCNode): Record<string, string> {
  switch (node.kind) {
    case "ProgramDiagnostics":
      return { kind: "ProgramDiagnostics" }
    case "SourceFileDiagnostics":
      return {
        kind: "SourceFileDiagnostics",
        file: node.file.path.replace(cwd(), "."),
      }
    case "StmtDiagnostics":
      return {
        kind: "StmtDiagnostics",
        source_file: node.source_file.path.replace(cwd(), "."),
        stmt_kind: node.stmt.kind,
        ...stmt_attrs(node.stmt),
        location: node.stmt.span.start.toString(),
      }
    case "FindDeclInSourceFile":
      return {
        kind: "FindDeclInSourceFile",
        source_file: node.source_file.path.replace(cwd(), "."),
        name: node.name,
      }
  }
}

function stmt_attrs(stmt: Stmt): Record<string, string> {
  switch (stmt.kind) {
    case "Func":
      return {
        name: `function ` + (stmt.func.name?.text ?? "null") + `()`,
      }
  }
  return {}
}

interface TCGraphResult {
  render_to_file(path: string): Promise<void>
}
export function build_tc_graph(source_files: SourceFiles): TCGraphResult {
  const graph = DirectedGraph.builder<TCNode>({
    kind: "ProgramDiagnostics",
    program: source_files,
  })
  run()
  return {
    render_to_file(path) {
      return render_graph(graph, tc_node_attrs, path)
    },
  }

  function run() {
    for (const source_file of source_files.values()) {
      source_file_diagnostics(source_file)
    }
  }

  function source_file_diagnostics(source_file: SourceFile) {
    using _ = graph.add_child({
      kind: "SourceFileDiagnostics",
      file: source_file,
    })
    for (const stmt of source_file.stmts) {
      stmt_diagnostics(source_file, stmt)
    }
  }

  function stmt_diagnostics(source_file: SourceFile, stmt: Stmt) {
    using _ = graph.add_child({ kind: "StmtDiagnostics", stmt, source_file })
    switch (stmt.kind) {
      case "ImportStarAs":
        return import_star_as_stmt_diagnostics(source_file, stmt)
      case "Import":
        return import_stmt_diagnostics(source_file, stmt)
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
  function import_star_as_stmt_diagnostics(
    source_file: SourceFile,
    stmt: ImportStarAsStmt,
  ) {
    const path = import_stmt_path(source_file, stmt)
    const imported_file = source_files.get(path)
    if (!imported_file) {
      todo`Importing from non-existent file: ${path}`
    }
  }
  function import_stmt_diagnostics(source_file: SourceFile, stmt: ImportStmt) {
    const path = import_stmt_path(source_file, stmt)
    const imported_file = source_files.get(path)
    if (!imported_file) {
      return todo`Importing from non-existent file: ${path}`
    }
    for (const name of stmt.named_imports) {
      switch (name.imported_name.kind) {
        case "Ident": {
          const decl = find_decl_in_source_file(
            name.imported_name.ident,
            imported_file,
          )
          break
        }
        case "String": {
          todo()
        }
        default:
          assert_never(name.imported_name)
      }
    }
  }
  function func_stmt_diagnostics(stmt: FuncStmt) {}
  function ljs_extern_function_stmt_diagnostics(stmt: LJSExternFunctionStmt) {}
  function var_decl_stmt_diagnostics(stmt: VarDeclStmt) {}
  function type_alias_stmt_diagnostics(stmt: TypeAliasStmt) {}
  function find_decl_in_source_file(name: Ident, source_file: SourceFile) {
    using _ = graph.add_child({
      kind: "FindDeclInSourceFile",
      source_file,
      name: name.text,
    })
  }
}
