import {
  DeclType,
  LJSExternFunctionStmt,
  PropExpr,
  ReturnStmt,
  Span,
  StructDeclStmt,
  UntaggedUnionDeclStmt,
  type StructInitExpr,
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
  AddressOfExpr,
  DerefExpr,
  LJSExternConstStmt,
  CallExpr,
  LJSBuiltinConstStmt,
  LJSBuiltinTypeStmt,
  TypeApplicationExpr,
} from "djs_ast"
import Path from "node:path"
import type { SourceFiles } from "./SourceFiles.ts"
import {
  Type,
  type_is_convertible_from_numeric_literal,
  type_is_floating_point,
  type_is_integral,
  type_is_one_of,
  type_is_pointer,
  type_to_string,
  type StructInstanceType,
} from "./type.ts"
import { Diagnostics } from "./diagnostics.ts"
import { assert_never, defer, is_readonly_array, TODO, zip } from "djs_std"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { annotation_to_type, type TypeVarEnv } from "./annotation_to_type.ts"
import assert from "node:assert"
import type {
  BuiltinConstDecl,
  TypeDecl,
  ValueDecl,
  ValueDeclOfKind,
} from "./SymbolTable.ts"
import type { ResolveResult } from "./resolve.ts"
import { existsSync } from "node:fs"
import { builtin_types, builtin_values } from "./builtins.ts"
import { Subst } from "./subt.ts"

export interface TypecheckResult {
  values: Map<Expr, Type>
  types: Map<TypeAnnotation, Type>
  var_decls: Map<VarDecl, CheckedVarDecl[]>
  /**
   * Expressions that refer to a builtin const.
   * e.g.
   * builtin const linkc
   *
   * linkc("some.c_file")
   * ^^^^^ This will be in the map (excluding the call)
   *
   * Can also be a prop expr
   * e.g.
   * import * as mem from "ljs:mem"
   * mem.tranmute<X, Y>(...)
   * ^^^^^^^^^^^^ This will be in the map (excluding the type application and call)
   */
  builtin_const_refs: Map<PropExpr | VarExpr, BuiltinConstDecl>
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
  const value_decls = resolution.values
  const type_decls = resolution.types
  const _diagnostics = new Diagnostics(source_files.fs)
  const values = new Map<Expr, Type>()
  const types = new Map<TypeAnnotation, Type>()
  const check_func_signature_results = new Map<Func, CheckFuncSignatureResult>()
  const source_file_check_results = new Map<SourceFile, null>()
  const check_var_decl_result = new Map<VarDecl, CheckedVarDecl[]>()
  const check_extern_function_results = new Map<LJSExternFunctionStmt, Type>()
  const check_extern_const_results = new Map<LJSExternConstStmt, Type>()
  const loop_stack: LoopStmt[] = []
  const builtin_const_refs = new Map<PropExpr | VarExpr, BuiltinConstDecl>()

  interface CheckStructDeclResult {
    constructor_type: Extract<Type, { kind: "StructConstructor" }>
    instance_type: Extract<Type, { kind: "StructInstance" }>
  }
  const check_struct_decl_stmt_results = new Map<
    StructDeclStmt,
    CheckStructDeclResult
  >()

  interface CheckUntaggedUnionDeclResult {
    constructor_type: Extract<Type, { kind: "UntaggedUnionConstructor" }>
    instance_type: Extract<Type, { kind: "UntaggedUnionInstance" }>
  }
  const check_untagged_union_decl_stmt_results = new Map<
    UntaggedUnionDeclStmt,
    CheckUntaggedUnionDeclResult
  >()

  for (const file of source_files.values()) {
    check_source_file(file)
  }

  return {
    diagnostics: _diagnostics,
    values,
    types,
    var_decls: check_var_decl_result,
    builtin_const_refs,
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
      case "LJSExternFunction":
        check_ljs_extern_function_stmt(ctx.source_file, stmt)
        return
      case "LJSExternConst":
        check_ljs_extern_const_stmt(ctx.source_file, stmt)
        return
      case "Expr":
        infer_expr(ctx.source_file, stmt.expr)
        return
      case "Return":
        return check_return_stmt(ctx, stmt)
      case "StructDecl":
        return check_struct_decl_stmt(ctx.source_file, stmt)
      case "UntaggedUnionDecl":
        return check_untagged_union_decl_stmt(ctx.source_file, stmt)
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
      case "LJSExternType":
        break
      case "LJSBuiltinConst":
        return check_builtin_const_stmt(ctx, stmt)
      case "LJSBuiltinType":
        return check_builtin_type_stmt(ctx, stmt)
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
  function check_struct_decl_stmt(
    source_file: SourceFile,
    stmt: StructDeclStmt,
  ): CheckStructDeclResult {
    const existing = check_struct_decl_stmt_results.get(stmt)
    if (existing) return existing
    const ctx = make_check_ctx(source_file, check_struct_decl_stmt_results)

    const members: Record<string, Type> = {}
    for (const member of stmt.struct_def.members) {
      switch (member.kind) {
        case "FieldDef":
          if (member.name.text in members) {
            emit_error(
              ctx,
              member.name.span,
              `Duplicate field name ${member.name.text} in struct ${stmt.struct_def.name.text}`,
            )
          }
          members[member.name.text] = check_type_annotation(
            ctx.source_file,
            member.type_annotation,
          )
          break
        default:
          assert_never(member.kind)
      }
    }
    const qualified_name = qualified_name_of_decl(
      stmt.struct_def.name,
      ctx.source_file.path,
    )
    return {
      constructor_type: Type.StructConstructor(qualified_name, members),
      instance_type: Type.StructInstance(qualified_name, members),
    }
  }
  function check_builtin_const_stmt(ctx: CheckCtx, stmt: LJSBuiltinConstStmt) {
    if (!(stmt.name.text in builtin_values)) {
      emit_error(ctx, stmt.name.span, `Unknown builtin const ${stmt.name.text}`)
    }
  }

  function check_builtin_type_stmt(ctx: CheckCtx, stmt: LJSBuiltinTypeStmt) {
    if (!(stmt.name.text in builtin_types)) {
      emit_error(ctx, stmt.name.span, `Unknown builtin type ${stmt.name.text}`)
    }
  }
  function check_untagged_union_decl_stmt(
    source_file: SourceFile,
    stmt: UntaggedUnionDeclStmt,
  ): CheckUntaggedUnionDeclResult {
    const existing = check_untagged_union_decl_stmt_results.get(stmt)
    if (existing) return existing
    const ctx = make_check_ctx(
      source_file,
      check_untagged_union_decl_stmt_results,
    )
    const variants: Record<string, Type> = {}
    for (const member of stmt.untagged_union_def.members) {
      switch (member.kind) {
        case "VariantDef":
          if (member.name.text in variants) {
            emit_error(
              ctx,
              member.name.span,
              `Duplicate variant name ${member.name.text} in untagged union ${stmt.untagged_union_def.name.text}`,
            )
          }
          variants[member.name.text] = check_type_annotation(
            ctx.source_file,
            member.type_annotation,
          )
          break
        default:
          assert_never(member.kind)
      }
    }
    const qualified_name = qualified_name_of_decl(
      stmt.untagged_union_def.name,
      ctx.source_file.path,
    )
    const result = {
      constructor_type: Type.UntaggedUnionConstructor(qualified_name, variants),
      instance_type: Type.UntaggedUnionInstance(qualified_name, variants),
    }
    check_untagged_union_decl_stmt_results.set(stmt, result)
    return result
  }
  function check_return_stmt(ctx: CheckCtx, stmt: ReturnStmt) {
    if (stmt.value) {
      const func = resolution.return_stmt_enclosing_func.get(stmt)
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
      return_type: Type.void,
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

  function check_ljs_extern_function_stmt(
    source_file: SourceFile,
    stmt: LJSExternFunctionStmt,
  ): Type {
    const existing = check_extern_function_results.get(stmt)
    if (existing) return existing

    const ctx = make_check_ctx(source_file, check_extern_function_results)
    const param_types: Type[] = []
    for (const param of stmt.params) {
      if (!param.type_annotation) {
        emit_error(
          ctx,
          param.span,
          "An extern function parameter must have a type annotation",
        )
        continue
      } else {
        param_types.push(
          check_type_annotation(ctx.source_file, param.type_annotation),
        )
      }
    }
    const return_type = check_type_annotation(ctx.source_file, stmt.return_type)
    const ty = Type.UnboxedFunc(param_types, return_type)
    check_extern_function_results.set(stmt, ty)
    return ty
  }
  function check_ljs_extern_const_stmt(
    source_file: SourceFile,
    stmt: LJSExternConstStmt,
  ): Type {
    const existing = check_extern_const_results.get(stmt)
    if (existing) return existing

    const ctx = make_check_ctx(source_file, check_extern_const_results)
    const type = check_type_annotation(ctx.source_file, stmt.type_annotation)
    check_extern_const_results.set(stmt, type)
    return type
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
      default: {
        const inferred = infer_expr(ctx.source_file, expr)
        if (inferred.kind === "BuiltinUninitialized") {
          values.set(expr, inferred)
          return
        }
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
      case "Ptr":
        return (
          (source.kind === "Ptr" || source.kind === "MutPtr") &&
          is_assignable({ source: source.type, target: target.type })
        )
      case "MutPtr":
        return (
          source.kind === "MutPtr" &&
          is_assignable({ source: source.type, target: target.type })
        )
      case "void":
      case "c_char":
      case "c_int":
      case "u8":
      case "u16":
      case "u32":
      case "u64":
      case "i8":
      case "i16":
      case "i32":
      case "i64":
      case "f32":
      case "f64":
      case "boolean":
        return target.kind === source.kind
      case "StructInstance":
        return (
          source.kind === "StructInstance" &&
          qualified_name_eq(target.qualified_name, source.qualified_name)
        )
      case "UntaggedUnionInstance":
        return (
          source.kind === "UntaggedUnionInstance" &&
          qualified_name_eq(target.qualified_name, source.qualified_name)
        )
      case "Opaque":
        return (
          source.kind === "Opaque" &&
          qualified_name_eq(target.qualified_name, source.qualified_name)
        )

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
      case "Number":
        return Type.i64
      case "StructInit": {
        return infer_struct_init_expr(ctx, expr)
      }
      case "Boolean":
        return Type.boolean
      case "BinOp":
        return infer_binop_expr(ctx, expr)
      case "PostIncrement":
        return infer_post_increment_expr(ctx, expr)
      case "Assign":
        return infer_assign_expr(ctx, expr)
      case "AddressOf":
        return infer_address_of_expr(ctx, expr)
      case "Deref":
        return infer_deref_expr(ctx, expr)
      case "Paren":
        return infer_expr(ctx.source_file, expr.expr)
      case "TypeApplication":
        return infer_type_application_expr(ctx, expr)
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

  function infer_address_of_expr(ctx: CheckCtx, expr: AddressOfExpr): Type {
    if (expr.expr.kind !== "Var") {
      emit_error(ctx, expr.expr.span, "Can only take the address of a variable")
    } else if (expr.mut) {
      check_address_of_mutability(ctx, expr.expr.ident)
    }
    const inner_type = infer_expr(ctx.source_file, expr.expr)
    if (inner_type.kind === "Error") return inner_type
    if (expr.mut) {
      return Type.MutPtr(inner_type)
    } else {
      return Type.Ptr(inner_type)
    }
  }

  /**
   * For exprs like `foo.&mut`, check if `foo` is a `let` variable
   * which can be converted to a mutable pointer.
   */
  function check_address_of_mutability(ctx: CheckCtx, ident: Ident): void {
    const decl = value_decls.get(ctx.source_file.path)?.get(ident)
    if (!decl) return
    if (decl.kind !== "VarDecl" || decl.decl.decl_type !== "Let") {
      emit_error(
        ctx,
        ident.span,
        "It's not possible to take the mutable address of this variable",
        decl.kind === "VarDecl"
          ? `${ident.text} is declared with ${decl.decl.decl_type.toLowerCase()} but you're trying to call .&mut on it.`
          : undefined,
      )
    }
  }
  function infer_deref_expr(ctx: CheckCtx, expr: DerefExpr): Type {
    const inner_type = infer_expr(ctx.source_file, expr.expr)
    if (inner_type.kind === "Ptr" || inner_type.kind === "MutPtr") {
      return inner_type.type
    }
    if (inner_type.kind !== "Error") {
      emit_error(
        ctx,
        expr.span,
        `Cannot dereference a ${type_to_string(inner_type)}`,
      )
    }
    return Type.Error(`Cannot dereference a ${type_to_string(inner_type)}`)
  }

  function infer_assign_expr(ctx: CheckCtx, expr: AssignExpr): Type {
    if (expr.pattern.kind === "Var") {
      if (expr.operator !== "Eq") {
        emit_error(ctx, expr.span, "Only simple assignment is supported in LJS")
        return infer_expr(ctx.source_file, expr.value)
      }
      const values = resolution.values.get(ctx.source_file.path)
      assert(values)
      const decl = values.get(expr.pattern.ident)
      if (!decl) {
        // Unbound variables are reported in the resolve phase
        return infer_expr(ctx.source_file, expr.value)
      }
      const lhs_type = type_of_decl(expr.pattern.ident.text, decl)
      check_expr(ctx, expr.value, lhs_type)
      return lhs_type
    } else if (expr.pattern.kind === "Deref") {
      const inner_type = infer_expr(ctx.source_file, expr.pattern.expr)
      if (inner_type.kind === "Error") return inner_type
      if (!type_is_one_of(inner_type, "Ptr", "MutPtr")) {
        return emit_error_type(ctx, {
          message: `Cannot assign to a dereference of a non-pointer type ${type_to_string(inner_type)}`,
          span: expr.pattern.expr.span,
        })
      }
      if (inner_type.kind !== "MutPtr") {
        return emit_error_type(ctx, {
          message: `Assignment needs a mutable pointer`,
          span: expr.pattern.expr.span,
          hint: "A let variable's address can be converted to a mutable pointer using the var_name.&mut syntax",
        })
      }
      check_expr(ctx, expr.value, inner_type.type)
      return inner_type.type
    } else if (
      expr.pattern.kind === "Prop" &&
      expr.pattern.key.kind === "Ident" &&
      expr.pattern.expr.kind === "Var"
    ) {
      const pattern_lhs_ty = infer_expr(ctx.source_file, expr.pattern.expr)
      let struct_ty: StructInstanceType
      if (pattern_lhs_ty.kind === "StructInstance") {
        struct_ty = pattern_lhs_ty
      } else if (
        type_is_pointer(pattern_lhs_ty) &&
        pattern_lhs_ty.type.kind === "StructInstance"
      ) {
        struct_ty = pattern_lhs_ty.type
        if (pattern_lhs_ty.kind === "Ptr") {
          emit_error(
            ctx,
            expr.pattern.expr.span,
            "Assigning to an immutable pointer is not allowed.",
          )
        }
      } else {
        return emit_error_type(ctx, {
          span: expr.pattern.expr.span,
          message: `Cannot access property on a non-struct type ${type_to_string(
            pattern_lhs_ty,
          )}`,
        })
      }
      const field_ty = struct_ty.fields[expr.pattern.key.ident.text]
      if (!field_ty) {
        return emit_error_type(ctx, {
          span: expr.pattern.key.span,
          message: `Struct ${struct_ty.qualified_name} has no field named ${expr.pattern.key.ident.text}`,
          hint: `Available fields: ${Object.keys(struct_ty.fields).join(", ")}`,
        })
      }
      check_expr(ctx, expr.value, field_ty)
      return field_ty
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
      case "Sub": {
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

  function infer_struct_init_expr(ctx: CheckCtx, expr: StructInitExpr): Type {
    const lhs_type = infer_expr(ctx.source_file, expr.lhs)

    if (lhs_type.kind === "StructConstructor") {
      // TODO: Check for extra and duplicate fields in the initializer

      for (const [name, expected_type] of Object.entries(lhs_type.fields)) {
        const field = expr.fields.find((f) => f.Key.text === name)
        if (!field) {
          emit_error(ctx, expr.lhs.span, `Missing field ${name} in struct init`)
          continue
        }
        check_expr(ctx, field.value, expected_type)
      }

      return {
        kind: "StructInstance",
        qualified_name: lhs_type.qualified_name,
        fields: lhs_type.fields,
      }
    } else if (lhs_type.kind === "UntaggedUnionConstructor") {
      // For untagged unions, exactly one variant must be specified
      if (expr.fields.length !== 1) {
        return emit_error_type(ctx, {
          message: `Untagged union initialization must have exactly one variant, got ${expr.fields.length}`,
          span: expr.span,
          hint: null,
        })
      }

      const field = expr.fields[0]
      const variant_name = field.Key.text
      const expected_type = lhs_type.variants[variant_name]

      if (!expected_type) {
        return emit_error_type(ctx, {
          message: `Unknown variant '${variant_name}' in untagged union`,
          span: field.Key.span,
          hint: `Available variants: ${Object.keys(lhs_type.variants).join(", ")}`,
        })
      }

      check_expr(ctx, field.value, expected_type)
      return {
        kind: "UntaggedUnionInstance",
        qualified_name: lhs_type.qualified_name,
        variants: lhs_type.variants,
      }
    } else {
      return emit_error_type(ctx, {
        message:
          "Expected a struct or untagged union constructor on the left-hand side of initialization",
        span: expr.lhs.span,
        hint: `Got ${type_to_string(lhs_type)}`,
      })
    }
  }
  function emit_error_type(
    ctx: CheckCtx,
    error: { message: string; span: Span; hint?: string | null },
  ): Type {
    emit_error(ctx, error.span, error.message, error.hint)
    return Type.Error(error.message)
  }
  function infer_var_expr(ctx: CheckCtx, expr: VarExpr): Type {
    const decl = value_decls.get(ctx.source_file.path)?.get(expr.ident)
    if (!decl) {
      return emit_error_type(ctx, {
        message: `Unbound variable ${expr.ident.text}`,
        span: expr.span,
        hint: null,
      })
    }
    if (decl.kind === "BuiltinConst") {
      assert(!builtin_const_refs.has(expr))
      builtin_const_refs.set(expr, decl)
    }
    return type_of_decl(expr.ident.text, decl)
  }

  function infer_call_expr(ctx: CheckCtx, expr: CallExpr): Type {
    const lhs_type = infer_expr(ctx.source_file, expr.callee)
    if (lhs_type.kind === "Error") {
      return lhs_type
    }
    if (lhs_type.kind === "BuiltinLinkC") {
      check_builtin_linkc_call_args(ctx, expr)
      return Type.void
    }
    if (lhs_type.kind === "UnboxedFunc") {
      if (expr.args.length !== lhs_type.params.length) {
        emit_error(
          ctx,
          expr.callee.span,
          `Expected ${lhs_type.params.length} arguments, got ${expr.args.length}`,
        )
      }
      for (const [arg, expected_type] of zip(expr.args, lhs_type.params)) {
        check_expr(ctx, arg, expected_type)
      }
      return lhs_type.return_type
    } else {
      expr.args.map((arg) => infer_expr(ctx.source_file, arg))
      return emit_error_type(ctx, {
        span: expr.callee.span,
        message: `Expected a function, got ${type_to_string(lhs_type)}`,
      })
    }
  }
  function check_builtin_linkc_call_args(ctx: CheckCtx, call: CallExpr) {
    if (call.args.length !== 1 || call.args[0].kind !== "String") {
      emit_error(
        ctx,
        call.callee.span,
        "ljs:builtin/linkc expects a single string argument",
      )
      return
    }
    const relative = call.args[0].text.slice(1, -1)
    const resolved = Path.join(Path.dirname(ctx.source_file.path), relative)

    if (!existsSync(resolved)) {
      emit_error(ctx, call.callee.span, `Could not read file ${resolved}`)
    }
  }

  function infer_prop_expr(ctx: CheckCtx, expr: PropExpr): Type {
    const lhs_module_decl = get_module_decl(ctx.source_file, expr.lhs)
    if (lhs_module_decl) {
      const decl = lhs_module_decl.values.get(expr.property.text)
      if (!decl) {
        return emit_error_type(ctx, {
          message: `${expr.property.text} was not found in the module`,
          span: expr.property.span,
          hint:
            `Available properties: ` +
            [...lhs_module_decl.values.keys()].slice(5).join(", "),
        })
      }
      if (decl.kind === "BuiltinConst") {
        assert(!builtin_const_refs.has(expr))
        builtin_const_refs.set(expr, decl)
      }
      return type_of_decl(expr.property.text, decl)
    } else {
      const lhs = infer_expr(ctx.source_file, expr.lhs)
      if (lhs.kind === "StructInstance") {
        return (
          lhs.fields[expr.property.text] ??
          emit_error_type(ctx, {
            message: `Property ${expr.property.text} does not exist on type ${type_to_string(lhs)}`,
            span: expr.property.span,
            hint: `Available properties: ` + Object.keys(lhs.fields).join(", "),
          })
        )
      } else if (
        (lhs.kind === "Ptr" || lhs.kind === "MutPtr") &&
        lhs.type.kind === "StructInstance"
      ) {
        return (
          lhs.type.fields[expr.property.text] ??
          emit_error_type(ctx, {
            message: `Property ${expr.property.text} does not exist on type ${type_to_string(lhs)}`,
            span: expr.property.span,
            hint:
              `Available properties: ` +
              Object.keys(lhs.type.fields).join(", "),
          })
        )
      } else {
        return emit_error_type(ctx, {
          message: `Expected a module or a struct on the left-hand side of the property access`,
          span: expr.lhs.span,
          hint: null,
        })
      }
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
      case "LJSExternFunction": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const ty = check_ljs_extern_function_stmt(source_file, decl.stmt)
        return ty
      }
      case "LJSExternConst": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        return check_ljs_extern_const_stmt(source_file, decl.stmt)
      }
      case "Struct": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_struct_decl_stmt(source_file, decl.decl)
        const type = result.constructor_type
        assert(type, "Expected check_stmt to set the struct constructor's type")
        return type
      }
      case "UntaggedUnion": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_untagged_union_decl_stmt(source_file, decl.decl)
        const type = result.constructor_type
        assert(
          type,
          "Expected check_stmt to set the untagged union constructor's type",
        )
        return type
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
        return Type.UnboxedFunc(
          result.params.map(([, t]) => t),
          result.return_type,
        )
      }
      case "BuiltinConst": {
        if (name in builtin_values) {
          return builtin_values[name as keyof typeof builtin_values].type
        } else {
          throw new Error(`Unknown builtin const: ${name}`)
        }
      }
      default: {
        return TODO(`type_of_decl for ${decl.kind} with name ${name}`)
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
    ctx: CheckCtx,
    expr: TaggedTemplateLiteralExpr,
  ): Type {
    const callee = expr.tag
    const callee_ty = infer_expr(ctx.source_file, expr.tag)
    if (callee_ty.kind === "CStringConstructor") {
      return infer_and_check_c_string_expr(ctx, expr)
    }
    return emit_error_type(ctx, {
      message: `TODO: infer_tagged_template_literal_expr for ${callee_ty}`,
      span: callee.span,
      hint: null,
    })
  }

  function infer_and_check_c_string_expr(
    ctx: CheckCtx,
    expr: TaggedTemplateLiteralExpr,
  ): Type {
    if (expr.fragments.length !== 1 || expr.fragments[0].kind !== "Text") {
      emit_error_type(ctx, {
        message: `Expected a constant template literal for @builtin("c_str"), got ${expr.fragments.length}`,
        span: expr.span,
        hint: `@builtin("c_str") must be used like this @builtin("c_str")\`some constant string without interpolation\``,
      })
    }

    return Type.Ptr(Type.c_char)
  }

  function make_type_var_env(ctx: CheckCtx): TypeVarEnv {
    return (t) => lookup_type_var(ctx, t)
  }

  function lookup_qualified_type_name(
    ctx: CheckCtx,
    t: readonly Ident[],
  ): Type {
    const [module_name, ...rest] = t
    const decls = type_decls.get(ctx.source_file.path)
    if (!decls) TODO()
    const decl = decls.get(module_name)

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

    const member = decl.types.get(rest[0].text)
    if (!member) {
      return emit_error_type(ctx, {
        message: `Unknown type ${rest[0].text} in module ${module_name.text}`,
        span: rest[0].span,
      })
    }
    return type_decl_to_type(
      {
        ...ctx,
        source_file: source_files.get(decl.path)!,
      },
      member,
    )
  }
  function lookup_type_var(ctx: CheckCtx, t: Ident | readonly Ident[]): Type {
    if (is_readonly_array(t)) {
      return lookup_qualified_type_name(ctx, t)
    } else {
      const decls = type_decls.get(ctx.source_file.path)
      if (!decls) TODO()
      const decl = decls.get(t)
      if (!decl) {
        return emit_error_type(ctx, {
          span: t.span,
          message: `Unbound type variable ${t.text}`,
        })
      }
      return type_decl_to_type(ctx, decl)
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

  function type_decl_to_type(ctx: CheckCtx, decl: TypeDecl): Type {
    switch (decl.kind) {
      case "Builtin":
        return decl.type
      case "TypeAlias": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        return check_type_annotation(ctx.source_file, decl.stmt.type_annotation)
      }
      case "ExternType": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const name = qualified_name_of_decl(decl.stmt.name, source_file.path)
        return Type.Opaque(name)
      }
      case "Module":
        return TODO()
      case "ImportStarAs":
        return TODO("ImportStarAs")
      case "Import":
        return TODO("Import")
      case "Struct": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_struct_decl_stmt(source_file, decl.decl)
        return result.instance_type
      }
      case "UntaggedUnion": {
        const source_file = source_files.get(decl.source_file)
        assert(source_file, `Unknown source file: ${decl.source_file}`)
        const result = check_untagged_union_decl_stmt(source_file, decl.decl)
        return result.instance_type
      }
      case "BuiltinType":
        return decl.type
      default:
        return assert_never(decl)
    }
  }

  function qualified_name_of_decl(
    ident: Ident,
    source_file_path: string,
  ): string[] {
    const source_file = source_files.get(source_file_path)
    assert(source_file, `Unknown source file: ${source_file_path}`)
    // TODO: Convert the source path into a qualified module name
    return [ident.text]
  }
}

function qualified_name_eq(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}
