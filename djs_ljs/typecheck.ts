import {
  expr_to_sexpr,
  sexpr_to_string,
  type Expr,
  type FuncStmt,
  type SourceFile,
  type Stmt,
  type TypeAnnotation,
  type VarDeclStmt,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { Type } from "./type.ts"
import { Diagnostics } from "./diagnostics.ts"
import { todo } from "djs_std"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { annotation_to_type } from "./annotation_to_type.ts"
import { Trace } from "./Trace.ts"

export interface TypecheckResult {
  types: Map<Expr, Type>
  diagnostics: Diagnostics
  trace: Trace
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
    using _ = trace.add(`check_source_file\n${file.path}`)
    for (const stmt of file.stmts) {
      check_stmt(file, stmt)
    }
  }
  function check_stmt(source_file: SourceFile, stmt: Stmt): void {
    using _ = trace.add(`check_stmt\n${source_file.path}:${stmt.span.start}`)
    switch (stmt.kind) {
      case "Import":
        return check_import_stmt(source_file, stmt)
      case "ImportStarAs":
        return check_import_star_as_stmt(source_file, stmt)
      case "TypeAlias":
        return check_type_alias_stmt(source_file, stmt)
      case "Func":
        return check_func_stmt(source_file, stmt)
      case "VarDecl":
        return check_var_decl_stmt(source_file, stmt)
      case "LJSExternFunction":
        return check_ljs_extern_function_stmt(source_file, stmt)
      case "Expr":
        infer_expr(source_file, stmt.expr)
        return
      default:
        todo(stmt.kind)
    }
  }

  function check_import_stmt(source_file: SourceFile, stmt: Stmt): void {
    using _ = trace.add(
      `check_import_stmt\n${source_file.path}:${stmt.span.start}`,
    )
  }
  function check_import_star_as_stmt(
    source_file: SourceFile,
    stmt: Stmt,
  ): void {
    using _ = trace.add(
      `check_import_star_as_stmt\n${source_file.path}:${stmt.span.start}}`,
    )
  }
  function check_type_alias_stmt(source_file: SourceFile, stmt: Stmt): void {
    using _ = trace.add(
      `check_type_alias_stmt\n${source_file.path}:${stmt.span.start}}`,
    )
  }
  function check_func_stmt(
    source_file: SourceFile,
    { func, span }: FuncStmt,
  ): void {
    using _ = trace.add(`check_func_stmt\n${source_file.path}:${span.start}`)
    for (const stmt of func.body.stmts) {
      check_stmt(source_file, stmt)
    }
  }
  function check_var_decl_stmt(
    source_file: SourceFile,
    stmt: VarDeclStmt,
  ): void {
    using _ = trace.add(
      `check_var_decl_stmt\n${source_file.path}:${stmt.span.start}`,
      short_stmt_name(stmt),
    )
    for (const decl of flatten_var_decl(stmt)) {
      const annotation = decl.type_annotation
      let type: Type | null = null
      if (annotation) {
        type = check_type_annotation(annotation)
      }
      if (decl.init) {
        if (type) {
          check_expr(source_file, decl.init, type)
        } else {
          infer_expr(source_file, decl.init)
        }
      }
    }
  }

  function check_ljs_extern_function_stmt(
    source_file: SourceFile,
    stmt: Stmt,
  ): void {
    using _ = trace.add(
      `check_ljs_extern_function_stmt\n${source_file.path}:${stmt.span.start}}`,
    )
  }

  function check_expr(
    source_file: SourceFile,
    expr: Expr,
    expected_type: Type,
  ): void {
    using _ = trace.add(
      `check_expr\n${source_file.path}:${expr.span.start}`,
      sexpr_to_string(expr_to_sexpr(expr)),
    )

    // TODO
    infer_expr(source_file, expr)
  }
  function infer_expr(source_file: SourceFile, expr: Expr): Type {
    using _ = trace.add(
      `infer_expr\n${source_file.path}:${expr.span.start}`,
      sexpr_to_string(expr_to_sexpr(expr)),
    )
    return Type.Error("Unimplemented: infer_expr for " + expr.kind)
  }

  function check_type_annotation(annotation: TypeAnnotation): Type {
    using _ = trace.add(`check_type_annotation(${annotation})`)
    return annotation_to_type((v) => Type.Error("Unbound type" + v), annotation)
  }
}

function short_stmt_name(stmt: Stmt): string {
  return stmt.kind
}
