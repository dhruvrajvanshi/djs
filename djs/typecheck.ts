import {
  DeclType,
  PropExpr,
  ReturnStmt,
  Span,
  TaggedTemplateLiteralExpr,
  VarExpr,
  type Expr,
  type Func,
  type FuncStmt,
  type Ident,
  type SourceFile,
  type Stmt,
  type TypeAnnotation,
  TypeAliasStmt,
  type VarDecl,
  ForStmt,
  type Block,
  BinOpExpr,
  PostIncrementExpr,
  IfStmt,
  ForInOrOfStmt,
  WhileStmt,
  DoWhileStmt,
  AssignExpr,
  CallExpr,
  TypeApplicationExpr,
  AsExpr,
  TernaryExpr,
  QualifiedName,
} from "djs_ast"
import Path from "node:path"
import type { SourceFiles } from "./SourceFiles.ts"
import {
  Type,
  type_is_convertible_from_numeric_literal,
  type_is_floating_point,
  type_is_integral,
  type_is_one_of,
  type_to_string,
} from "./type.ts"
import { Diagnostics } from "./diagnostics.ts"
import {
  assert_never,
  defer,
  is_readonly_array,
  PANIC,
  TODO,
  zip,
} from "djs_std"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { annotation_to_type, type TypeVarEnv } from "./annotation_to_type.ts"
import assert from "node:assert"
import { existsSync } from "node:fs"
import { Subst } from "./subt.ts"
import type { ResolveResult } from "./resolve.ts"
import type { ModuleDecl, TypeDecl, ValueDecl } from "./decl.ts"

export interface TypecheckResult {
  values: Map<Expr, Type>
  types: Map<TypeAnnotation, Type>
  var_decls: Map<VarDecl, CheckedVarDecl[]>
  diagnostics: Diagnostics
}
interface CheckedVarDecl {
  decl_type: DeclType
  name: string
  type: Type
  init: Expr
}

type LoopStmt = ForStmt | ForInOrOfStmt | WhileStmt | DoWhileStmt

export function typecheck(
  source_files: SourceFiles,
  resolution: ResolveResult,
): TypecheckResult {
  const { return_stmt_enclosing_func } = resolution
  const _diagnostics = new Diagnostics(source_files.fs)
  const values = new Map<Expr, Type>()
  const types = new Map<TypeAnnotation, Type>()
  const check_func_signature_results = new Map<Func, CheckFuncSignatureResult>()
  const source_file_check_results = new Map<SourceFile, null>()
  const check_var_decl_result = new Map<VarDecl, CheckedVarDecl[]>()
  const loop_stack: LoopStmt[] = []

  for (const file of source_files.values()) {
    check_source_file(file)
  }

  return {
    diagnostics: _diagnostics,
    values,
    types,
    var_decls: check_var_decl_result,
  }

  function check_source_file(file: SourceFile): void {
    if (source_file_check_results.has(file)) {
      return
    }
    source_file_check_results.set(file, null)
    const ctx = make_check_ctx(file, source_file_check_results)
    for (const stmt of file.stmts) {
      check_stmt(ctx, stmt)
      if (stmt.kind === "Return") {
        emit_error(
          ctx,
          stmt.span,
          "Return statements are only allowed inside functions",
        )
      }
    }
  }
  function check_stmt(ctx: CheckCtx, stmt: Stmt) {
    switch (stmt.kind) {
      case "Import":
        return check_import_stmt(ctx, stmt)
      case "ImportStarAs":
        return check_import_star_as_stmt(ctx, stmt)
      case "TypeAlias":
        return check_type_alias_stmt(ctx, stmt)
      case "Func":
        return check_func_stmt(ctx, stmt)
      case "VarDecl":
        check_var_decl(ctx.source_file, stmt.decl)
        return
      case "Expr":
        infer_expr(ctx.source_file, stmt.expr)
        return
      case "Return":
        return check_return_stmt(ctx, stmt)
      case "For":
        return check_for_stmt(ctx, stmt)
      case "Block":
        return check_block(ctx, stmt.block)
      case "If":
        return check_if_stmt(ctx, stmt)
      case "While":
        return check_while_stmt(ctx, stmt)

      case "Break":
      case "Continue":
        break
      default:
        TODO(stmt.kind)
    }
  }
  function check_if_stmt(ctx: CheckCtx, stmt: IfStmt) {
    check_expr(ctx, stmt.condition, Type.boolean)
    check_stmt(ctx, stmt.if_true)
    if (stmt.if_false) {
      check_stmt(ctx, stmt.if_false)
    }
  }
  function check_while_stmt(ctx: CheckCtx, stmt: WhileStmt) {
    loop_stack.push(stmt)
    using _ = defer(() => {
      assert(loop_stack.pop() === stmt)
    })
    check_expr(ctx, stmt.condition, Type.boolean)
    check_stmt(ctx, stmt.body)
  }
  function check_block(ctx: CheckCtx, block: Block): void {
    for (const s of block.stmts) {
      check_stmt(ctx, s)
    }
  }

  function check_for_stmt(ctx: CheckCtx, stmt: ForStmt) {
    loop_stack.push(stmt)
    using _ = defer(() => {
      assert(loop_stack.pop() === stmt)
    })
    switch (stmt.init.kind) {
      case "VarDecl":
        check_var_decl(ctx.source_file, stmt.init.decl)
        break
      case "Expr":
        emit_error(
          ctx,
          stmt.init.expr.span,
          "For statement initializers must be a var declaration",
        )
        return
      default:
        assert_never(stmt.init)
    }
    if (stmt.test) check_expr(ctx, stmt.test, Type.boolean)
    if (stmt.update) infer_expr(ctx.source_file, stmt.update)
    check_stmt(ctx, stmt.body)
  }

  function check_return_stmt(ctx: CheckCtx, stmt: ReturnStmt) {
    if (stmt.value) {
      const func = return_stmt_enclosing_func.get(stmt)
      if (func) {
        const { return_type } = check_func_signature(ctx.source_file, func)
        check_expr(ctx, stmt.value, return_type)
      }
      return { values: new Map(), types: new Map(), var_decls: [] }
    } else {
      emit_error(ctx, stmt.span, "Return statement must have a value")
      return { values: new Map(), types: new Map(), var_decls: [] }
    }
  }

  /**
   * A CheckCtx is used to ensure that functions that might potentially emit
   * diagnostics are only checked once.
   * To create a CheckCtx, you need to pass a *proof* of uniqueness,
   * which is typically a Map that caches the results of a `check_*` function.
   */
  interface CheckCtx {
    source_file: SourceFile
    diagnostics: Diagnostics
    __proof: "__check_ctx__"
  }
  function check_import_stmt(_: CheckCtx, __: Stmt): void {}
  function check_import_star_as_stmt(_: CheckCtx, __: Stmt): void {}
  function check_type_alias_stmt(ctx: CheckCtx, stmt: TypeAliasStmt): void {
    check_type_annotation(ctx.source_file, stmt.type_annotation)
  }
  function check_func_stmt(ctx: CheckCtx, { func, span }: FuncStmt): void {
    check_func_signature(ctx.source_file, func)
    for (const stmt of func.body.stmts) {
      check_stmt(ctx, stmt)
    }
  }
  interface CheckFuncSignatureResult {
    params: [name: Ident, type: Type][]
    return_type: Type
  }
  function check_func_signature(
    source_file: SourceFile,
    func: Func,
  ): CheckFuncSignatureResult {
    const existing = check_func_signature_results.get(func)
    if (existing) {
      return existing
    }
    // Temporary result to break the cycle
    check_func_signature_results.set(func, {
      params: [],
      return_type: Type.unknown,
    })
    const ctx = make_check_ctx(source_file, check_func_signature_results)
    const params: [name: Ident, type: Type][] = []
    for (const param of func.params) {
      if (!param.type_annotation) {
        emit_error(
          ctx,
          param.pattern.span,
          "A function parameter must have a type annotation",
        )
        continue
      }
      const type = check_type_annotation(ctx.source_file, param.type_annotation)
      if (param.pattern.kind !== "Var") {
        emit_error(
          ctx,
          param.pattern.span,
          "Destructuring not supported in function parameters",
        )
        continue
      }
      params.push([param.pattern.ident, type])
    }
    let return_type: Type | null = null
    if (func.return_type) {
      return_type = check_type_annotation(ctx.source_file, func.return_type)
    } else {
      return_type = emit_error_type(ctx, {
        span: func.name?.span ?? func.params[0].span ?? func.span,
        message: "Function must have a return type",
      })
    }
    const result: CheckFuncSignatureResult = {
      params,
      return_type,
    }
    check_func_signature_results.set(func, result)
    return result
  }

  function check_var_decl(
    source_file: SourceFile,
    decl: VarDecl,
  ): CheckedVarDecl[] {
    const existing = check_var_decl_result.get(decl)
    if (existing) {
      return existing
    }
    const var_decls: CheckedVarDecl[] = []
    check_var_decl_result.set(decl, var_decls)
    const ctx = make_check_ctx(source_file, check_var_decl_result)
    const values = new Map<string, Type>()
    for (const flattened_decl of flatten_var_decl(decl)) {
      const annotation = flattened_decl.type_annotation
      let type: Type | null = null
      if (annotation) {
        type = check_type_annotation(ctx.source_file, annotation)
      }
      if (flattened_decl.init) {
        if (type) {
          check_expr(ctx, flattened_decl.init, type)
          values.set(flattened_decl.name, type)
          var_decls.push({
            decl_type: flattened_decl.decl_type,
            name: flattened_decl.name,
            type,
            init: flattened_decl.init,
          })
        } else {
          const ty = infer_expr(ctx.source_file, flattened_decl.init)
          values.set(flattened_decl.name, ty)
          var_decls.push({
            decl_type: flattened_decl.decl_type,
            name: flattened_decl.name,
            type: ty,
            init: flattened_decl.init,
          })
        }
      }
    }
    return var_decls
  }
  function emit_error(
    ctx: CheckCtx,
    span: Span,
    message: string,
    hint: string | null = null,
  ): void {
    _diagnostics.push(ctx.source_file.path, {
      message,
      span,
      hint: hint ?? null,
    })
  }

  function check_expr(ctx: CheckCtx, expr: Expr, expected_type: Type): void {
    if (values.has(expr)) {
      return
    }

    switch (expr.kind) {
      case "Number":
        if (
          !type_is_convertible_from_numeric_literal(expected_type, expr.text)
        ) {
          emit_error(
            ctx,
            expr.span,
            `Expected a ${type_to_string(expected_type)}`,
          )
        }
        values.set(expr, expected_type)
        return
      case "BinOp": {
        check_binop_expr(ctx, expr, expected_type)
        values.set(expr, expected_type)
        return
      }
      case "Null": {
        values.set(expr, expected_type)
        return
      }
      case "UnaryMinus":
      case "UnaryPlus": {
        check_expr(ctx, expr.expr, expected_type)
        values.set(expr, expected_type)
        return
      }

      default: {
        const inferred = infer_expr(ctx.source_file, expr)
        if (!is_assignable({ source: inferred, target: expected_type })) {
          emit_error(
            ctx,
            expr.span,
            `Expected ${type_to_string(expected_type)}, got ${type_to_string(
              inferred,
            )}`,
          )
        }
        values.set(expr, expected_type)
      }
    }
  }
  function is_assignable({
    source,
    target,
  }: {
    source: Type
    target: Type
  }): boolean {
    if (source.kind === "Error" || target.kind === "Error") {
      return true
    }
    switch (target.kind) {
      case "unknown":
        return true
      case "boolean":
        return target.kind === source.kind
      default:
        return false
    }
  }
  function make_check_ctx(
    source_file: SourceFile,
    _proof_of_uniqueness: Map<unknown, unknown> | Set<unknown>,
  ): CheckCtx {
    return {
      source_file,
      diagnostics: _diagnostics,
      __proof: "__check_ctx__",
    }
  }
  function infer_expr(source_file: SourceFile, expr: Expr): Type {
    const existing = values.get(expr)
    if (existing) return existing

    const ctx = make_check_ctx(source_file, values)
    const ty = infer_expr_worker(ctx, expr)
    values.set(expr, ty)
    return ty
  }
  function infer_expr_worker(ctx: CheckCtx, expr: Expr): Type {
    switch (expr.kind) {
      case "TaggedTemplateLiteral":
        return infer_tagged_template_literal_expr(ctx, expr)
      case "Prop":
        return infer_prop_expr(ctx, expr)
      case "Call":
        return infer_call_expr(ctx, expr)
      case "Var":
        return infer_var_expr(ctx, expr)
      case "Ternary":
        return infer_ternary_expr(ctx, expr)
      case "Boolean":
        return Type.boolean
      case "BinOp":
        return infer_binop_expr(ctx, expr)
      case "PostIncrement":
        return infer_post_increment_expr(ctx, expr)
      case "Assign":
        return infer_assign_expr(ctx, expr)
      case "Paren":
        return infer_expr(ctx.source_file, expr.expr)
      case "TypeApplication":
        return infer_type_application_expr(ctx, expr)
      case "As":
        return infer_as_expr(ctx, expr)
      case "Not": {
        check_expr(ctx, expr.expr, Type.boolean)
        values.set(expr, Type.boolean)
        return Type.boolean
      }
      case "UnaryMinus":
      case "UnaryPlus": {
        const inner_type = infer_expr(ctx.source_file, expr.expr)
        if (
          !type_is_integral(inner_type) &&
          !type_is_floating_point(inner_type)
        ) {
          emit_error(
            ctx,
            expr.span,
            `Unary operator ${expr.kind} requires an integral or floating point operand, but got ${type_to_string(inner_type)}`,
          )
        }
        values.set(expr, inner_type)
        return inner_type
      }
      default: {
        return emit_error_type(ctx, {
          message: `TODO: ${expr.kind} cannot be inferred at the moment`,
          span: expr.span,
        })
      }
    }
  }
  function infer_type_application_expr(
    ctx: CheckCtx,
    expr: TypeApplicationExpr,
  ): Type {
    const callee_type = infer_expr(ctx.source_file, expr.expr)
    if (callee_type.kind !== "Forall") {
      return emit_error_type(ctx, {
        message: "Type application on a non-polymorphic type",
        span: expr.span,
      })
    }

    if (callee_type.params.length !== expr.type_args.length) {
      emit_error(
        ctx,
        expr.span,
        "Type application with incorrect number of type arguments",
      )
    }
    const subst = Subst.of_application(
      callee_type.params,
      expr.type_args.map((type_arg) =>
        check_type_annotation(ctx.source_file, type_arg),
      ),
    )
    return Subst.apply(subst, callee_type.body)
  }

  function is_valid_cast(source_type: Type, target_type: Type): boolean {
    TODO()
  }

  function infer_as_expr(ctx: CheckCtx, expr: AsExpr): Type {
    const source_type = infer_expr(ctx.source_file, expr.expr)
    const target_type = check_type_annotation(
      ctx.source_file,
      expr.type_annotation,
    )

    if (!is_valid_cast(source_type, target_type)) {
      emit_error(
        ctx,
        expr.span,
        `Cannot cast from ${type_to_string(source_type)} to ${type_to_string(target_type)}`,
      )
    }

    return target_type
  }

  function infer_assign_expr(ctx: CheckCtx, expr: AssignExpr): Type {
    if (expr.pattern.kind === "Var") {
      if (expr.operator !== "Eq") {
        emit_error(ctx, expr.span, "Only simple assignment is supported in LJS")
        return infer_expr(ctx.source_file, expr.value)
      }
      const decl = resolution.values.get(expr.pattern.ident)
      if (!decl) {
        // Unbound variables are reported in the resolve phase
        return infer_expr(ctx.source_file, expr.value)
      }
      const lhs_type = type_of_decl(expr.pattern.ident.text, decl)
      check_expr(ctx, expr.value, lhs_type)
      return lhs_type
    } else {
      emit_error(ctx, expr.pattern.span, "Unsupported assignment pattern")
      return infer_expr(ctx.source_file, expr.value)
    }
  }
  function infer_post_increment_expr(
    ctx: CheckCtx,
    expr: PostIncrementExpr,
  ): Type {
    const inner_type = infer_expr(ctx.source_file, expr.value)
    if (!type_is_integral(inner_type)) {
      return emit_error_type(ctx, {
        message: `The operand of a post-increment must be an integral type`,
        span: expr.value.span,
        hint: `Got ${type_to_string(inner_type)}`,
      })
    }
    return inner_type
  }
  function infer_binop_expr(ctx: CheckCtx, expr: BinOpExpr): Type {
    return infer_or_check_binop_expr(ctx, expr, null)
  }
  function check_binop_expr(
    ctx: CheckCtx,
    expr: BinOpExpr,
    expected_type: Type,
  ): void {
    infer_or_check_binop_expr(ctx, expr, expected_type)
  }
  function infer_or_check_binop_expr(
    ctx: CheckCtx,
    expr: BinOpExpr,
    expected_type: Type | null,
  ): Type {
    switch (expr.operator) {
      case "Lt":
      case "Lte":
      case "Gt":
      case "Gte": {
        const lhs_type = infer_expr(ctx.source_file, expr.lhs)
        if (!type_is_integral(lhs_type) && !type_is_floating_point(lhs_type)) {
          emit_error(
            ctx,
            expr.lhs.span,
            `Expected an integral or floating point type on the left-hand side of ${expr.operator}`,
            `Got ${type_to_string(lhs_type)}`,
          )
          return Type.boolean
        }
        check_expr(ctx, expr.rhs, lhs_type)
        return Type.boolean
      }
      case "Add":
      case "Sub":
      case "Mul": {
        const lhs_type = expected_type
          ? (check_expr(ctx, expr.lhs, expected_type), expected_type)
          : infer_expr(ctx.source_file, expr.lhs)
        if (!type_is_integral(lhs_type) && !type_is_floating_point(lhs_type)) {
          emit_error(
            ctx,
            expr.lhs.span,
            `Expected an integral or floating point type on the left-hand side of ${expr.operator}`,
            `Got ${type_to_string(lhs_type)}`,
          )
        }
        check_expr(ctx, expr.rhs, lhs_type)
        return lhs_type
      }
      case "EqEq":
      case "NotEq": {
        check_expr(ctx, expr.rhs, infer_expr(ctx.source_file, expr.lhs))
        emit_error(
          ctx,
          expr.span,
          `Use '===' or '!==' for equality comparisons`,
          null,
        )
        return Type.boolean
      }
      case "EqEqEq":
      case "NotEqEq": {
        return infer_equality_operator(ctx, expr)
      }
      default:
        TODO(expr.operator)
    }
  }

  function infer_equality_operator(ctx: CheckCtx, expr: BinOpExpr): Type {
    const lhs_type = infer_expr(ctx.source_file, expr.lhs)
    check_expr(ctx, expr.rhs, lhs_type)
    return Type.boolean
  }
  function infer_ternary_expr(ctx: CheckCtx, expr: TernaryExpr): Type {
    check_expr(ctx, expr.condition, Type.boolean)
    const then_type = infer_expr(ctx.source_file, expr.if_false)
    check_expr(ctx, expr.if_false, then_type)
    return then_type
  }

  function emit_error_type(
    ctx: CheckCtx,
    error: { message: string; span: Span; hint?: string | null },
  ): Type {
    emit_error(ctx, error.span, error.message, error.hint)
    return Type.Error(error.message)
  }
  function infer_var_expr(ctx: CheckCtx, expr: VarExpr): Type {
    const decl = resolution.values.get(expr.ident)
    if (!decl) {
      return emit_error_type(ctx, {
        message: `Unbound variable ${expr.ident.text}`,
        span: expr.span,
        hint: null,
      })
    }
    return type_of_decl(expr.ident.text, decl)
  }

  function infer_call_expr(ctx: CheckCtx, expr: CallExpr): Type {
    const lhs_type = infer_expr(ctx.source_file, expr.callee)
    if (lhs_type.kind === "Error") {
      return lhs_type
    }

    TODO()
  }

  function infer_prop_expr(ctx: CheckCtx, expr: PropExpr): Type {
    const lhs_module_decl = get_module_decl(expr.lhs)
    if (lhs_module_decl) {
      const decl = lhs_module_decl.values.get(expr.property.text)
      if (!decl) {
        let hint =
          `Available properties: ` +
          [...lhs_module_decl.values.keys()].slice(5).join(", ")
        if (lhs_module_decl.private_values.has(expr.property.text)) {
          hint = `${expr.property.text} is not exported`
        }
        return emit_error_type(ctx, {
          message: `${expr.property.text} was not found in the module`,
          span: expr.property.span,
          hint,
        })
      }
      return type_of_decl(expr.property.text, decl)
    } else {
      TODO()
    }
  }

  function type_of_decl(name: string, decl: ValueDecl): Type {
    switch (decl.kind) {
      case "VarDecl": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_var_decl(source_file, decl.decl)
        const declarator = result.find((it) => it.name === name)
        assert(declarator, `Expected a declarator for variable ${name}`)
        return declarator.type
      }
      case "Param": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_func_signature(source_file, decl.func)
        const param = result.params[decl.param_index]
        assert(param, `Expected parameter ${decl.param_index} in function`)
        return param[1]
      }
      case "Func": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_func_signature(source_file, decl.func)
        TODO()
      }
      case "Module":
        return TODO()
    }
  }
  function get_module_decl(expr: Expr): ModuleDecl | null {
    if (expr.kind !== "Var") return null
    const lhs_decl = resolution.values.get(expr.ident)
    if (!lhs_decl) return null
    switch (lhs_decl.kind) {
      case "Module":
        return lhs_decl
      default:
        return null
    }
  }

  function infer_tagged_template_literal_expr(
    ctx: CheckCtx,
    expr: TaggedTemplateLiteralExpr,
  ): Type {
    const callee = expr.tag
    const callee_ty = infer_expr(ctx.source_file, expr.tag)
    return emit_error_type(ctx, {
      message: `TODO: infer_tagged_template_literal_expr for ${callee_ty}`,
      span: callee.span,
      hint: null,
    })
  }

  function make_type_var_env(ctx: CheckCtx): TypeVarEnv {
    return (t) => lookup_type_var(ctx, t)
  }

  function lookup_qualified_type_name(
    ctx: CheckCtx,
    t: readonly Ident[],
  ): Type {
    const [module_name, ...rest] = t
    const decl = resolution.types.get(module_name)

    if (!decl || decl.kind !== "Module") {
      return emit_error_type(ctx, {
        message: `${module_name.text} is not a module`,
        span: module_name.span,
      })
    }
    if (rest.length !== 1) {
      return emit_error_type(ctx, {
        message: `Expected a single type after module name, got ${rest.length}`,
        span: module_name.span,
        hint: null,
      })
    }

    const member = decl.types.get(rest[0].text) ?? null
    if (!member) {
      return emit_error_type(ctx, {
        message: `Unknown type ${rest[0].text} in module ${module_name.text}`,
        span: rest[0].span,
      })
    }

    assert(
      member.kind !== "Module",
      "Should not happen because of the rest.length !== 1 check above",
    )
    return type_decl_to_type(member)
  }
  function lookup_type_var(ctx: CheckCtx, t: Ident | readonly Ident[]): Type {
    if (is_readonly_array(t)) {
      return lookup_qualified_type_name(ctx, t)
    } else {
      const decl = resolution.types.get(t)
      if (!decl) {
        return emit_error_type(ctx, {
          span: t.span,
          message: `Unbound type variable ${t.text}`,
        })
      }
      if (decl.kind === "Module") {
        return emit_error_type(ctx, {
          span: t.span,
          message: `${t.text} is a module, not a type`,
        })
      }
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
    const ctx = make_check_ctx(source_file, types)
    const t = annotation_to_type(
      make_type_var_env(ctx),
      annotation,
      (message) => emit_error_type(ctx, { message, span: annotation.span }),
    )
    types.set(annotation, t)
    return t
  }

  function type_decl_to_type(decl: TypeDecl): Type {
    switch (decl.kind) {
      case "TypeAlias": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        return check_type_annotation(source_file, decl.stmt.type_annotation)
      }
      case "Module":
        TODO("Using module as a type")
      default:
        return assert_never(decl)
    }
  }

  function qualified_name_of_decl(
    ident: Ident,
    source_file_path: string,
  ): QualifiedName {
    const source_file = source_files.get(source_file_path)
    assert(source_file, `Unknown source file: ${source_file_path}`)
    return QualifiedName.append(source_file.qualified_name, ident.text)
  }
}

function qualified_name_eq(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}
