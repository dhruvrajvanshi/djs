import {
  BuiltinExpr,
  expr_to_sexpr,
  LJSExternFunctionStmt,
  PropExpr,
  sexpr_to_string,
  Span,
  TaggedTemplateLiteralExpr,
  VarExpr,
  type Expr,
  type FuncStmt,
  type Ident,
  type SourceFile,
  type Stmt,
  type TypeAnnotation,
  type VarDeclStmt,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { Type, type_to_string } from "./type.ts"
import { Diagnostics } from "./diagnostics.ts"
import { is_readonly_array, todo } from "djs_std"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { annotation_to_type, type TypeVarEnv } from "./annotation_to_type.ts"
import { Trace } from "./Trace.ts"
import assert from "node:assert"
import type { TypeDecl, ValueDecl, ValueDeclOfKind } from "./SymbolTable.ts"
import type { ResolveResult } from "./resolve.ts"

export interface TypecheckResult {
  values: Map<Expr, Type>
  types: Map<TypeAnnotation, Type>
  diagnostics: Diagnostics
  trace: Trace
}

export function typecheck(
  source_files: SourceFiles,
  resolution: ResolveResult,
): TypecheckResult {
  const value_decls = resolution.values
  const type_decls = resolution.types
  const diagnostics = new Diagnostics(source_files.fs)
  const values = new Map<Expr, Type>()
  const types = new Map<TypeAnnotation, Type>()
  const trace = new Trace()
  const check_stmt_results = new Map<Stmt, CheckStmtResult>()

  for (const file of source_files.values()) {
    check_source_file(file)
  }

  return {
    diagnostics,
    values,
    types,
    trace,
  }

  function check_source_file(file: SourceFile): void {
    using _ = trace.add(`check_source_file\n${file.path}`)
    for (const stmt of file.stmts) {
      check_stmt(file, stmt)
    }
  }

  type CheckStmtResult = void | {
    values: Map<string, Type>
    types: Map<string, Type>
  }

  function check_stmt(source_file: SourceFile, stmt: Stmt): CheckStmtResult {
    const existing = check_stmt_results.get(stmt)
    if (existing) return existing
    const result = check_stmt_worker(source_file, stmt)
    check_stmt_results.set(stmt, result)
    return result
  }
  function check_stmt_worker(
    source_file: SourceFile,
    stmt: Stmt,
  ): CheckStmtResult {
    using _ = trace.add(
      `check_stmt\n${source_file.path}:${stmt.span.start}:${stmt.span.stop}`,
    )
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
    for (const param of func.params) {
      if (param.type_annotation) {
        check_type_annotation(source_file, param.type_annotation)
      }
    }
    if (func.return_type) {
      check_type_annotation(source_file, func.return_type)
    }
    for (const stmt of func.body.stmts) {
      check_stmt(source_file, stmt)
    }
  }
  function check_var_decl_stmt(
    source_file: SourceFile,
    stmt: VarDeclStmt,
  ): CheckStmtResult {
    using _ = trace.add(
      `check_var_decl_stmt\n${source_file.path}:${stmt.span.start}`,
      short_stmt_name(stmt),
    )
    const values = new Map<string, Type>()
    for (const decl of flatten_var_decl(stmt)) {
      const annotation = decl.type_annotation
      let type: Type | null = null
      if (annotation) {
        type = check_type_annotation(source_file, annotation)
      }
      if (decl.init) {
        if (type) {
          check_expr(source_file, decl.init, type)
          values.set(decl.name, type)
        } else {
          const ty = infer_expr(source_file, decl.init)
          values.set(decl.name, ty)
        }
      }
    }
    return { values, types: new Map() }
  }

  function check_ljs_extern_function_stmt(
    source_file: SourceFile,
    stmt: LJSExternFunctionStmt,
  ): CheckStmtResult {
    using _ = trace.add(
      `check_ljs_extern_function_stmt\n${source_file.path}:${stmt.span.start}}`,
    )
    const param_types: Type[] = []
    for (const param of stmt.params) {
      if (!param.type_annotation) {
        diagnostics.push(source_file.path, {
          message: "An extern function parameter must have a type annotation",
          span: param.span,
          hint: null,
        })
        continue
      } else {
        param_types.push(
          check_type_annotation(source_file, param.type_annotation),
        )
      }
    }
    const return_type = check_type_annotation(source_file, stmt.return_type)
    return {
      values: new Map([
        [stmt.name.text, Type.UnboxedFunc(param_types, return_type)],
      ]),
      types: new Map(),
    }
  }

  function check_expr(
    source_file: SourceFile,
    expr: Expr,
    expected_type: Type,
  ): void {
    if (values.has(expr)) {
      return
    }
    using _ = trace.add(
      `check_expr\n${source_file.path}:${expr.span.start}`,
      sexpr_to_string(expr_to_sexpr(expr)),
    )

    // TODO
    infer_expr(source_file, expr)
  }
  function infer_expr(source_file: SourceFile, expr: Expr): Type {
    const existing = values.get(expr)
    if (existing) return existing

    const ty = infer_expr_worker(source_file, expr)
    values.set(expr, ty)
    return ty
  }
  function infer_expr_worker(source_file: SourceFile, expr: Expr): Type {
    using _ = trace.add(
      `infer_expr\n${source_file.path}:${expr.span.start}:${expr.span.stop}`,
      sexpr_to_string(expr_to_sexpr(expr)),
    )
    switch (expr.kind) {
      case "TaggedTemplateLiteral":
        return infer_tagged_template_literal_expr(source_file, expr)
      case "Prop":
        return infer_prop_expr(source_file, expr)
      case "Builtin":
        return infer_builtin_expr(source_file, expr)
      case "Call":
        return infer_call_expr(source_file, expr)
      case "Var":
        return infer_var_expr(source_file, expr)
      default: {
        return emit_error_type(source_file, {
          message: `TODO(${expr.kind})`,
          span: expr.span,
        })
      }
    }
  }
  function emit_error_type(
    source_file: SourceFile,
    error: { message: string; span: Span; hint?: string | null },
  ): Type {
    diagnostics.push(source_file.path, {
      message: error.message,
      span: error.span,
      hint: error.hint ?? null,
    })
    return Type.Error(error.message)
  }
  function infer_var_expr(source_file: SourceFile, expr: VarExpr): Type {
    const decl = value_decls.get(source_file.path)?.get(expr.ident)
    if (!decl) {
      return emit_error_type(source_file, {
        message: `Unbound variable ${expr.ident.text}`,
        span: expr.span,
        hint: null,
      })
    }
    return type_of_decl(expr.ident.text, decl)
  }

  function infer_call_expr(
    source_file: SourceFile,
    expr: Expr & { kind: "Call" },
  ): Type {
    const lhs_type = infer_expr(source_file, expr.callee)
    const arg_types = expr.args.map((arg) => infer_expr(source_file, arg))
    if (lhs_type.kind === "Error") {
      return lhs_type
    }
    if (lhs_type.kind === "UnboxedFunc") {
      diagnostics.push(source_file.path, {
        message: `TODO: match arg types with function parameters`,
        span: expr.callee.span,
        hint: `Expected: ${lhs_type.params.map((t) => t.toString()).join(", ")}`,
      })
      return lhs_type.return_type
    } else {
      return emit_error_type(source_file, {
        message: `Expected a function, got ${type_to_string(lhs_type)}`,
        span: expr.callee.span,
      })
    }
  }
  function infer_builtin_expr(
    source_file: SourceFile,
    expr: BuiltinExpr,
  ): Type {
    const builtin_name = JSON.parse(expr.text)
    switch (builtin_name) {
      case "c_str":
        return Type.CStringConstructor
      default: {
        return emit_error_type(source_file, {
          message: `Unknown builtin: ${builtin_name}`,
          span: expr.span,
        })
      }
    }
  }

  function infer_prop_expr(source_file: SourceFile, expr: PropExpr): Type {
    const lhs_module_decl = get_module_decl(source_file, expr.lhs)
    if (lhs_module_decl) {
      const decl = lhs_module_decl.values.get(expr.property.text)
      if (!decl) {
        return emit_error_type(source_file, {
          message: `${expr.property.text} was not found in the module`,
          span: expr.property.span,
          hint:
            `Available properties: ` +
            [...lhs_module_decl.values.keys()].slice(5).join(", "),
        })
      }
      return type_of_decl(expr.property.text, decl)
    } else todo("Not a moudle")
  }

  function type_of_decl(name: string, decl: ValueDecl): Type {
    switch (decl.kind) {
      case "VarDecl": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const check_stmt_result = check_stmt(source_file, decl.stmt)
        const ty = check_stmt_result?.values.get(name)
        assert(
          ty,
          `Expected type for ${name} in ${source_file.path}; ${check_stmt_result}; ${short_stmt_name(decl.stmt)}`,
        )
        return ty
      }
      case "LJSExternFunction": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_stmt(source_file, decl.stmt)
        const ty = result?.values.get(name)
        assert(ty, `Expected a type for LJSExternFunction ${name}`)
        return ty
      }
      default: {
        return todo(`type_of_decl for ${decl.kind} with name ${name}`)
      }
    }
  }
  function get_module_decl(
    source_file: SourceFile,
    expr: Expr,
  ): ValueDeclOfKind<"Module"> | null {
    if (expr.kind !== "Var") return null
    const lhs_decl = value_decls.get(source_file.path)?.get(expr.ident)
    if (!lhs_decl) return null
    switch (lhs_decl.kind) {
      case "Module":
        return lhs_decl
      default:
        return null
    }
  }

  function infer_tagged_template_literal_expr(
    source_file: SourceFile,
    expr: TaggedTemplateLiteralExpr,
  ): Type {
    const callee = expr.tag
    const callee_ty = infer_expr(source_file, expr.tag)
    if (callee_ty.kind === "CStringConstructor") {
      return infer_and_check_c_string_expr(source_file, expr)
    }
    return emit_error_type(source_file, {
      message: `TODO: infer_tagged_template_literal_expr for ${callee_ty}`,
      span: callee.span,
      hint: null,
    })
  }

  function infer_and_check_c_string_expr(
    source_file: SourceFile,
    expr: TaggedTemplateLiteralExpr,
  ): Type {
    if (expr.fragments.length !== 1 || expr.fragments[0].kind !== "Text") {
      diagnostics.push(source_file.path, {
        message: `Expected a constant template literal for @builtin("c_str"), got ${expr.fragments.length}`,
        span: expr.span,
        hint: `@builtin("c_str") must be used like this @builtin("c_str")\`some constant string without interpolation\``,
      })
    }

    return Type.Ptr(Type.c_char)
  }

  function make_type_var_env(source_file: SourceFile): TypeVarEnv {
    return (t) => lookup_type_var(source_file, t)
  }

  function lookup_type_var(
    source_file: SourceFile,
    t: Ident | readonly Ident[],
  ): Type {
    if (is_readonly_array(t)) {
      const [module_name, ...rest] = t
      const decls = type_decls.get(source_file.path)
      if (!decls) todo()
      const decl = decls.get(module_name)

      if (!decl || decl.kind !== "Module") {
        return emit_error_type(source_file, {
          message: `${module_name.text} is not a module`,
          span: module_name.span,
        })
      }
      if (rest.length !== 1) {
        return emit_error_type(source_file, {
          message: `Expected a single type after module name, got ${rest.length}`,
          span: module_name.span,
          hint: null,
        })
      }

      const member = decl.types.get(rest[0].text)
      if (!member) {
        return emit_error_type(source_file, {
          message: `Unknown type ${rest[0].text} in module ${module_name.text}`,
          span: rest[0].span,
        })
      }
      return type_decl_to_type(member)
    } else {
      const decls = type_decls.get(source_file.path)
      if (!decls) todo()
      const decl = decls.get(t)
      if (!decl) todo(`Unknown type: ${t.text} in ${source_file.path}`)
      return type_decl_to_type(decl)
    }
  }

  function check_type_annotation(
    source_file: SourceFile,
    annotation: TypeAnnotation,
  ): Type {
    const existing = types.get(annotation)
    if (existing) {
      return existing
    }
    using _ = trace.add(
      `check_type_annotation:${source_file.path}:${annotation.span.start}${annotation.span.stop}`,
    )

    const t = annotation_to_type(make_type_var_env(source_file), annotation)
    types.set(annotation, t)
    return t
  }

  function type_decl_to_type(decl: TypeDecl): Type {
    switch (decl.kind) {
      case "Builtin":
        return decl.type
      case "TypeAlias": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        return check_type_annotation(source_file, decl.stmt.type_annotation)
      }
      case "Module":
        return todo()
      case "ImportStarAs":
        return todo("ImportStarAs")
      case "Import":
        return todo("Import")
    }
  }
}

function short_stmt_name(stmt: Stmt): string {
  if (stmt.kind === "VarDecl") {
    return flatten_var_decl(stmt)
      .map((decl) => `${stmt.decl.decl_type.toLowerCase()} ${decl.name} = ...`)
      .join(";")
  }
  return stmt.kind
}
