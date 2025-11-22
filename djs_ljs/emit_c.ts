import type { SourceFiles } from "./SourceFiles.ts"
import { assert_never, assert_unreachable, defer, PANIC, TODO } from "djs_std"
import { type TypecheckResult } from "./typecheck.ts"
import type { ResolveImportsResult } from "./resolve_imports.ts"
import Path from "node:path"
import {
  type Expr,
  type Stmt,
  type FuncStmt,
  type TaggedTemplateLiteralExpr,
  type PropExpr,
  type TypeAnnotation,
  type Block,
  type Param,
  type SourceFile,
  type StructInitExpr,
  type ForStmt,
  type BinOp,
  type IfStmt,
  type WhileStmt,
  type DoWhileStmt,
  type ForInOrOfStmt,
  type ReturnStmt,
  type ContinueStmt,
  type AssignExpr,
  type StructDeclStmt,
  type UntaggedUnionDeclStmt,
  QualifiedName,
  TypeApplicationExpr,
  CallExpr,
  type Func,
} from "djs_ast"
import assert from "node:assert"
import { Type, type_is_pointer, type_to_string } from "./type.ts"
import type { ValueDeclOfKind } from "./SymbolTable.ts"

interface EmitContext {
  source_files: SourceFiles
  tc_result: TypecheckResult
  resolve_result: ResolveImportsResult
  loop_stack: LoopStackEntry[]
  link_c_paths: string[]
  implicit_return_value: CNode | null
}

type LoopStackEntry = { stmt: LoopStmt; source_file: SourceFile }
type LoopStmt = ForStmt | WhileStmt | DoWhileStmt | ForInOrOfStmt

/**
 * @returns C source code
 */
export function emit_c(
  source_files: SourceFiles,
  tc_result: TypecheckResult,
  resolve_result: ResolveImportsResult,
): { source: string; linkc_paths: string[] } {
  const ctx: EmitContext = {
    source_files,
    tc_result,
    resolve_result,
    loop_stack: [],
    link_c_paths: [],
    implicit_return_value: null,
  }

  // Phase 1: Collect forward declarations
  const forward_decls: CNode[] = []
  const defs: CNode[] = []

  const all_stmts = [...source_files.values()].flatMap((sf) =>
    sf.stmts.map((stmt) => ({ stmt, source_file: sf })),
  )
  for (const { stmt, source_file } of [...all_stmts].sort(types_first)) {
    switch (stmt.kind) {
      case "Func": {
        const func_name = stmt.func.name?.text
        assert(func_name, "Function must have a name")

        const params = stmt.func.params.map((param) => emit_param(ctx, param))
        let return_type = stmt.func.return_type
          ? emit_type_annotation(ctx, stmt.func.return_type)
          : ({ kind: "Ident", name: "void" } as CNode)
        if (
          is_main_func(stmt.func, source_file) &&
          (!stmt.func.return_type ||
            ctx.tc_result.types.get(stmt.func.return_type)?.kind === "void")
        ) {
          return_type = {
            kind: "Ident",
            name: "int",
          }
        }

        forward_decls.push({
          kind: "FuncForwardDecl",
          name: mangle_func_name(source_file, func_name),
          params,
          returns: return_type,
        })
        break
      }
      case "LJSExternFunction": {
        const func_name = stmt.name.text
        const params = stmt.params.map((param) => emit_param(ctx, param))
        const return_type = emit_type_annotation(ctx, stmt.return_type)

        forward_decls.push({
          kind: "ExternFunc",
          name: func_name,
          params,
          returns: return_type,
        })
        break
      }
      case "LJSExternConst": {
        const const_name = stmt.name.text
        const type = emit_type_annotation(ctx, stmt.type_annotation)

        forward_decls.push({
          kind: "ExternConst",
          name: const_name,
          type,
        })
        break
      }
      case "LJSExternType": {
        forward_decls.push({
          kind: "StructDecl",
          name: stmt.name.text,
        })
        break
      }
      case "StructDecl": {
        forward_decls.push(emit_struct_decl(ctx, source_file, stmt))
        break
      }
      case "UntaggedUnionDecl": {
        forward_decls.push(emit_untagged_union_decl(source_file, stmt))
        break
      }
    }
  }

  // Phase 2: Emit function definitions
  for (const { stmt, source_file } of [...all_stmts].sort(types_first)) {
    if (stmt.kind === "Func") {
      defs.push(emit_func_def(ctx, source_file, stmt))
    } else if (stmt.kind === "StructDecl") {
      defs.push(emit_struct_def(ctx, source_file, stmt))
    } else if (stmt.kind === "UntaggedUnionDecl") {
      defs.push(emit_untagged_union_def(ctx, source_file, stmt))
    } else {
      defs.push(emit_stmt(ctx, source_file, stmt))
    }
  }

  const c_nodes: CNode[] = [...forward_decls, ...defs]

  return {
    source:
      "#include <stdint.h>\n#include <stdbool.h>\n\n" + render_c_nodes(c_nodes),
    linkc_paths: ctx.link_c_paths,
  }
}
function emit_struct_decl(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: StructDeclStmt,
): CNode {
  const full_name = QualifiedName.append(
    source_file.qualified_name,
    stmt.struct_def.name.text,
  )
  return {
    kind: "StructDecl",
    name: mangle_struct_name(full_name),
  }
}
function emit_struct_def(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: StructDeclStmt,
): CNode {
  const fields = stmt.struct_def.members.map((member) => {
    const type_obj = ctx.tc_result.types.get(member.type_annotation)
    assert(type_obj, "Type annotation must have resolved type")

    if (type_obj.kind === "FixedSizeArray") {
      return {
        name: member.name.text,
        type: emit_type(type_obj.element_type),
        array_size: type_obj.size,
      }
    } else {
      return {
        name: member.name.text,
        type: emit_type(type_obj),
        array_size: null,
      }
    }
  })
  const full_name = QualifiedName.append(
    source_file.qualified_name,
    stmt.struct_def.name.text,
  )
  return {
    kind: "StructDef",
    name: mangle_struct_name(full_name),
    fields,
  }
}

function types_first(
  { stmt: a }: { stmt: Stmt },
  { stmt: b }: { stmt: Stmt },
): number {
  const is_type_decl = (kind: Stmt["kind"]) =>
    kind === "StructDecl" ||
    kind === "UntaggedUnionDecl" ||
    kind === "LJSExternType"
  if (is_type_decl(a.kind) && !is_type_decl(b.kind)) return -1
  if (!is_type_decl(a.kind) && is_type_decl(b.kind)) return 1
  return 0
}

function emit_param(ctx: EmitContext, param: Param): CNode {
  if (param.pattern.kind === "Rest") {
    assert(
      param.pattern.pattern.kind === "Var",
      "Rest param must be a variable",
    )
    return {
      kind: "...",
    }
  }
  assert(param.pattern.kind === "Var", "Param pattern must be a variable")
  const param_name = param.pattern.ident.text

  if (param.type_annotation) {
    const type_obj = ctx.tc_result.types.get(param.type_annotation)
    assert(type_obj, "Type annotation must have resolved type")

    if (type_obj.kind === "FixedSizeArray") {
      return {
        kind: "Param",
        name: param_name,
        type: emit_type(type_obj.element_type),
        array_size: type_obj.size,
      }
    } else {
      return {
        kind: "Param",
        name: param_name,
        type: emit_type(type_obj),
        array_size: null,
      }
    }
  } else {
    return {
      kind: "Param",
      name: param_name,
      type: { kind: "Ident", name: "void" } as CNode,
      array_size: null,
    }
  }
}

function emit_type_annotation(
  ctx: EmitContext,
  type_annotation: TypeAnnotation,
): CNode {
  const type_obj = ctx.tc_result.types.get(type_annotation)
  assert(type_obj, "Type annotation must have resolved type")

  return emit_type(type_obj)
}

function emit_type(type: Type): CNode {
  switch (type.kind) {
    case "c_int":
      return { kind: "Ident", name: "int" }
    case "c_char":
      return { kind: "Ident", name: "char" }
    case "void":
      return { kind: "Ident", name: "void" }
    case "u8":
      return { kind: "Ident", name: "uint8_t" }
    case "i8":
      return { kind: "Ident", name: "int8_t" }
    case "u16":
      return { kind: "Ident", name: "uint16_t" }
    case "i16":
      return { kind: "Ident", name: "int16_t" }
    case "i32":
      return { kind: "Ident", name: "int32_t" }
    case "u32":
      return { kind: "Ident", name: "uint32_t" }
    case "i64":
      return { kind: "Ident", name: "int64_t" }
    case "u64":
      return { kind: "Ident", name: "uint64_t" }
    case "boolean":
      return { kind: "Ident", name: "bool" }

    case "Ptr":
      return { kind: "ConstPtr", to_type: emit_type(type.type) }
    case "MutPtr":
      return { kind: "Ptr", to_type: emit_type(type.type) }
    case "StructInstance":
      return {
        kind: "StructTypeRef",
        name: mangle_struct_name(type.qualified_name),
      }
    case "Opaque":
      return {
        kind: "StructTypeRef",
        name: mangle_struct_name(type.qualified_name),
      }
    case "UntaggedUnionInstance":
      return {
        kind: "UnionTypeRef",
        name: mangle_union_name(type.qualified_name),
      }
    default:
      TODO(`Unhandled type: ${type.kind}`)
  }
}

function emit_func_def(
  ctx: EmitContext,
  source_file: SourceFile,
  func_stmt: FuncStmt,
): CNode {
  const func_name = func_stmt.func.name?.text
  assert(func_name, "Function must have a name")

  const params = func_stmt.func.params.map((param) => emit_param(ctx, param))
  let return_type = func_stmt.func.return_type
    ? emit_type_annotation(ctx, func_stmt.func.return_type)
    : ({ kind: "Ident", name: "void" } as CNode)
  const return_ty =
    func_stmt.func.return_type &&
    ctx.tc_result.types.get(func_stmt.func.return_type)

  const convert_void_return_to_int =
    is_main_func(func_stmt.func, source_file) &&
    (!return_ty || return_ty?.kind === "void")
  if (convert_void_return_to_int) {
    return_type = {
      kind: "Ident",
      name: "int",
    }
    ctx.implicit_return_value = {
      kind: "IntLiteral",
      value: 0,
    }
  }
  const body = emit_block(ctx, source_file, func_stmt.func.body)
  if (convert_void_return_to_int) {
    body.body.push({
      kind: "Return",
      value: {
        kind: "IntLiteral",
        value: 0,
      },
    })
  }
  ctx.implicit_return_value = null

  return {
    kind: "FuncDef",
    name: mangle_func_name(source_file, func_name),
    params,
    returns: return_type,
    body,
  }
}
function is_main_func(func: Func, source_file: SourceFile): boolean {
  return func.name?.text === "main" && source_file.qualified_name.length === 0
}

function emit_block(
  ctx: EmitContext,
  source_file: SourceFile,
  block: Block,
): Extract<CNode, { kind: "Block" }> {
  const body = block.stmts.map((s: Stmt) => emit_stmt(ctx, source_file, s))
  return { kind: "Block", body }
}

function emit_stmt(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: Stmt,
): CNode {
  switch (stmt.kind) {
    case "Block": {
      const body = stmt.block.stmts.map((s) => emit_stmt(ctx, source_file, s))
      return { kind: "Block", body }
    }
    case "VarDecl": {
      const var_decls = ctx.tc_result.var_decls.get(stmt.decl)
      assert(var_decls, "VarDeclStmt must have checked declarations")

      const decl_nodes = var_decls
        .filter((it) => it.type.kind !== "CStringConstructor")
        .map((decl): CNode => {
          const init_ty = ctx.tc_result.values.get(decl.init)
          assert(init_ty, "VarDecl init must have a type")
          const init_expr =
            init_ty.kind === "BuiltinUninitialized"
              ? null
              : emit_expr(ctx, source_file, decl.init)

          if (decl.type.kind === "FixedSizeArray") {
            return {
              kind: "VarDecl",
              type: emit_type(decl.type.element_type),
              name: decl.name,
              init: init_expr,
              array_size: decl.type.size,
            }
          } else {
            return {
              kind: "VarDecl",
              type: emit_type(decl.type),
              name: decl.name,
              init: init_expr,
              array_size: null,
            }
          }
        })
      return {
        kind: "Many",
        nodes: decl_nodes,
      }
    }
    case "Expr": {
      const expr = emit_expr(ctx, source_file, stmt.expr)
      return { kind: "ExprStmt", expr }
    }
    case "For":
      return emit_for_stmt(ctx, source_file, stmt)
    case "If":
      return emit_if_stmt(ctx, source_file, stmt)
    case "Continue":
      return emit_continue_stmt(ctx, source_file, stmt)
    case "Break":
      return { kind: "Break" }
    case "Return": {
      return emit_return_stmt(ctx, source_file, stmt)
    }
    case "Import":
    case "ImportStarAs":
    case "TypeAlias":
      return { kind: "Empty" }
    case "LJSExternFunction":
    case "LJSExternConst":
    case "LJSExternType":
      // Emitted in the declaration phase
      return { kind: "Empty" }
    case "LJSBuiltinConst":
    case "LJSBuiltinType":
      return { kind: "Empty" }
    default:
      TODO(`Unhandled statement: ${stmt.kind}`)
  }
}
function emit_return_stmt(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: ReturnStmt,
): CNode {
  const value = stmt.value ? emit_expr(ctx, source_file, stmt.value) : null
  return { kind: "Return", value }
}

function emit_continue_stmt(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: ContinueStmt,
): CNode {
  const stmts: CNode[] = []
  const loop_stack = [...ctx.loop_stack].reverse()
  for (const loop of loop_stack) {
    switch (loop.stmt.kind) {
      case "For":
        if (loop.stmt.update) {
          stmts.push(emit_expr(ctx, source_file, loop.stmt.update))
          stmts.push({ kind: "EmptyStmt" })
        }
    }
  }
  stmts.push({ kind: "Continue" })
  return { kind: "Many", nodes: stmts }
}

function emit_if_stmt(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: IfStmt,
): CNode {
  const condition = emit_expr(ctx, source_file, stmt.condition)
  const if_true = emit_stmt(ctx, source_file, stmt.if_true)
  const if_false = stmt.if_false
    ? emit_stmt(ctx, source_file, stmt.if_false)
    : null
  return { kind: "If", condition, if_true, if_false }
}

function emit_for_stmt(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: ForStmt,
): CNode {
  const loop_stack_entry: LoopStackEntry = { stmt, source_file }
  ctx.loop_stack.push(loop_stack_entry)
  using _ = defer(() => {
    ctx.loop_stack.pop()
  })
  const stmts: CNode[] = []
  assert(stmt.init.kind === "VarDecl")
  const init_var_decls = ctx.tc_result.var_decls.get(stmt.init.decl)
  assert(init_var_decls, "ForStmt VarDecl must have checked declarations")
  init_var_decls.forEach((decl) => {
    const init_expr = emit_expr(ctx, source_file, decl.init)
    if (decl.type.kind === "FixedSizeArray") {
      stmts.push({
        kind: "VarDecl",
        type: emit_type(decl.type.element_type),
        name: decl.name,
        init: init_expr,
        array_size: decl.type.size,
      })
    } else {
      stmts.push({
        kind: "VarDecl",
        type: emit_type(decl.type),
        name: decl.name,
        init: init_expr,
        array_size: null,
      })
    }
  })
  const actual_body: CNode =
    stmt.body.kind === "Block"
      ? {
          kind: "Many",
          nodes: stmt.body.block.stmts.map((s) =>
            emit_stmt(ctx, source_file, s),
          ),
        }
      : emit_stmt(ctx, source_file, stmt.body)
  const body: CNode[] = [actual_body]
  stmts.push({
    kind: "While",
    condition: stmt.test
      ? emit_expr(ctx, source_file, stmt.test)
      : { kind: "Ident", name: "true" },
    body: {
      kind: "Block",
      body,
    },
  })
  if (stmt.update) {
    body.push(emit_expr(ctx, source_file, stmt.update))
    body.push({ kind: "EmptyStmt" })
  }
  return {
    kind: "Block",
    body: stmts,
  }
}

function emit_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: Expr,
): CNode {
  switch (expr.kind) {
    case "Var": {
      return { kind: "Ident", name: expr.ident.text }
    }
    case "Call": {
      if (is_builtin_linkc(ctx, expr.callee)) {
        assert(expr.args.length === 1)
        const arg = expr.args[0]
        assert(arg.kind === "String")
        const path = Path.join(
          Path.dirname(source_file.path),
          JSON.parse(arg.text),
        )
        ctx.link_c_paths.push(path)
        return { kind: "Empty" }
      } else {
        const node = try_emit_cast(ctx, source_file, expr)
        if (node) return node
      }
      const func = emit_expr(ctx, source_file, expr.callee)
      const args = expr.args.map((arg) => emit_expr(ctx, source_file, arg))
      return { kind: "Call", func, args }
    }
    case "String": {
      const evaluated_string = evaluate_string_literal(expr.text)
      return { kind: "StringLiteral", value: evaluated_string }
    }
    case "Number": {
      const num_value = Number(expr.text)
      return { kind: "IntLiteral", value: num_value }
    }
    case "Boolean": {
      return { kind: "Ident", name: expr.value ? "true" : "false" }
    }
    case "TaggedTemplateLiteral": {
      return emit_tagged_template_literal_expr(ctx, expr)
    }
    case "Prop": {
      return emit_prop_expr(ctx, source_file, expr)
    }
    case "StructInit":
      return emit_struct_init_expr(ctx, source_file, expr)
    case "BinOp": {
      const ops: Partial<Record<BinOp, string>> = {
        Lt: "<",
        Gt: ">",
        Lte: "<=",
        Gte: ">=",
        Add: "+",
        Sub: "-",
        EqEqEq: "==",
        NotEqEq: "!=",
      }
      const op = ops[expr.operator]
      assert(op, `Unhandled binary operator: ${expr.operator}`)
      return {
        kind: "BinOp",
        op,
        left: emit_expr(ctx, source_file, expr.lhs),
        right: emit_expr(ctx, source_file, expr.rhs),
      }
    }
    case "PostIncrement":
      return {
        kind: "PostIncrement",
        expr: emit_expr(ctx, source_file, expr.value),
      }
    case "PostDecrement":
      return {
        kind: "PostDeclrement",
        expr: emit_expr(ctx, source_file, expr.value),
      }
    case "Assign": {
      return emit_assign_expr(ctx, source_file, expr)
    }
    case "AddressOf": {
      assert(expr.expr.kind === "Var")
      return {
        kind: "AddressOf",
        expr: emit_expr(ctx, source_file, expr.expr),
      }
    }
    case "Deref": {
      return {
        kind: "Deref",
        expr: emit_expr(ctx, source_file, expr.expr),
      }
    }
    case "TypeApplication":
      return emit_type_application_expr(ctx, source_file, expr)
    case "Null": {
      const ty = ctx.tc_result.values.get(expr)
      assert(ty, "expr must have a type")
      assert(ty.kind === "Ptr" || ty.kind === "MutPtr")
      return {
        kind: "Cast",
        to: emit_type(ty),
        expr: { kind: "IntLiteral", value: 0 },
      }
    }
    case "Not": {
      const expr_node = emit_expr(ctx, source_file, expr.expr)
      return {
        kind: "Not",
        expr: expr_node,
      }
    }
    case "Ternary": {
      const condition = emit_expr(ctx, source_file, expr.condition)
      const then_branch = emit_expr(ctx, source_file, expr.if_true)
      const else_branch = emit_expr(ctx, source_file, expr.if_false)
      return {
        kind: "Ternary",
        condition,
        then_branch,
        else_branch,
      }
    }
    default:
      TODO(`Unhandled expression: ${expr.kind}`)
  }
}
function try_emit_cast(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: CallExpr,
): CNode | null {
  // e.g. foo.cast<X>(arg)
  //   or cast<X>(arg)
  // This should be lowered to `((X) arg)`
  // However, if the pattern doesn't match, this would be treated as
  // a normal function call
  if (expr.callee.kind !== "TypeApplication") {
    return null
  }
  if (expr.callee.expr.kind !== "Prop" && expr.callee.expr.kind !== "Var") {
    return null
  }

  const builtin_const_ref = ctx.tc_result.builtin_const_refs.get(
    expr.callee.expr,
  )
  if (!builtin_const_ref) return null
  if (builtin_const_ref.name !== "cast") return null

  if (expr.callee.expr)
    assert(
      expr.callee.type_args.length === 1,
      "cast must have exactly one type argument",
    )
  const callee_ty = ctx.tc_result.values.get(expr.callee)
  assert(callee_ty, "Callee must have a type")
  const to_type = ctx.tc_result.types.get(expr.callee.type_args[0])
  assert(to_type)
  return {
    kind: "Cast",
    to: emit_type(to_type),
    expr: emit_expr(ctx, source_file, expr.args[0]),
  }
}
function emit_type_application_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: TypeApplicationExpr,
): CNode {
  assert_unreachable(
    "Type applications should be handled during emit_expr of the callee",
  )
}

/**
 * Checks if expr refers to builtin const linkc
 * E.g.
 * builtin const linkc
 * linkc("something")
 * ^^^^^^^^^   is_builtin_linkc(ljs.linkc) === true
 * Note that expr must not inlcude the call args
 */
function is_builtin_linkc(ctx: EmitContext, expr: Expr): boolean {
  const ty = ctx.tc_result.values.get(expr)
  assert(ty)
  return ty.kind === "BuiltinLinkC"
}
function emit_assign_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: AssignExpr,
): CNode {
  assert(expr.operator === "Eq", "Only simple assignment is supported")
  if (expr.pattern.kind === "Var") {
    const var_name = expr.pattern.ident.text
    const value = emit_expr(ctx, source_file, expr.value)
    return {
      kind: "BinOp",
      op: "=",
      left: { kind: "Ident", name: var_name },
      right: value,
    }
  } else if (expr.pattern.kind === "Deref") {
    const deref_expr = emit_expr(ctx, source_file, expr.pattern.expr)
    return {
      kind: "BinOp",
      op: "=",
      left: { kind: "Deref", expr: deref_expr },
      right: emit_expr(ctx, source_file, expr.value),
    }
  } else if (
    expr.pattern.kind === "Prop" &&
    expr.pattern.key.kind === "Ident"
  ) {
    const struct_ref = emit_expr(ctx, source_file, expr.pattern.expr)
    const struct_ty = ctx.tc_result.values.get(expr.pattern.expr)
    assert(struct_ty)

    let lhs_op: "." | "->"
    if (struct_ty.kind === "StructInstance") {
      lhs_op = "."
    } else if (
      type_is_pointer(struct_ty) &&
      struct_ty.type.kind === "StructInstance"
    ) {
      assert(struct_ty.kind === "MutPtr")
      lhs_op = "->"
    } else {
      PANIC(`Unexpected type for assignment lhs: ${type_to_string(struct_ty)}`)
    }
    const lhs: CNode = {
      kind: "BinOp",
      left: struct_ref,
      op: lhs_op,
      right: { kind: "Ident", name: expr.pattern.key.ident.text },
    }
    return {
      kind: "BinOp",
      op: "=",
      left: lhs,
      right: emit_expr(ctx, source_file, expr.value),
    }
  } else {
    return TODO`Unsupported assignment expr ${expr}`
  }
}
function emit_struct_init_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: StructInitExpr,
): CNode {
  const instance_type = ctx.tc_result.values.get(expr)
  const lhs_type = ctx.tc_result.values.get(expr.lhs)

  if (
    instance_type?.kind === "StructInstance" &&
    lhs_type?.kind === "StructConstructor"
  ) {
    return {
      kind: "Cast",
      to: {
        kind: "StructTypeRef",
        name: mangle_struct_name(lhs_type.qualified_name),
      },
      expr: {
        kind: "StructInit",
        fields: expr.fields.map((field) => ({
          key: field.Key.text,
          value: emit_expr(ctx, source_file, field.value),
        })),
      },
    }
  } else if (
    instance_type?.kind === "UntaggedUnionInstance" &&
    lhs_type?.kind === "UntaggedUnionConstructor"
  ) {
    assert(
      expr.fields.length === 1,
      "Untagged union init must have exactly one field",
    )
    const field = expr.fields[0]
    return {
      kind: "Cast",
      to: {
        kind: "UnionTypeRef",
        name: mangle_union_name(lhs_type.qualified_name),
      },
      expr: {
        kind: "UnionInit",
        field: field.Key.text,
        value: emit_expr(ctx, source_file, field.value),
      },
    }
  } else {
    TODO(
      `Unhandled struct init: instance_type=${instance_type?.kind}, lhs_type=${lhs_type?.kind}`,
    )
  }
}
function mangle_struct_name(qualified_name: readonly string[]): string {
  assert(qualified_name.length > 0, "Struct must have a name")
  return qualified_name.join("_")
}

function mangle_union_name(qualified_name: readonly string[]): string {
  assert(qualified_name.length > 0, "Union must have a name")
  return qualified_name.join("_")
}

function mangle_func_name(source_file: SourceFile, func_name: string): string {
  if (source_file.qualified_name.length === 0) {
    return func_name
  }
  return QualifiedName.append(source_file.qualified_name, func_name).join("_")
}

function emit_untagged_union_decl(
  source_file: SourceFile,
  stmt: UntaggedUnionDeclStmt,
): CNode {
  const full_name = QualifiedName.append(
    source_file.qualified_name,
    stmt.untagged_union_def.name.text,
  )
  return {
    kind: "UnionDecl",
    name: mangle_union_name(full_name),
  }
}

function emit_untagged_union_def(
  ctx: EmitContext,
  source_file: SourceFile,
  stmt: UntaggedUnionDeclStmt,
): CNode {
  const fields = stmt.untagged_union_def.members.map((member) => {
    assert(member.kind === "VariantDef", "Union member must be VariantDef")
    return {
      name: member.name.text,
      type: emit_type_annotation(ctx, member.type_annotation),
    }
  })
  const full_name = QualifiedName.append(
    source_file.qualified_name,
    stmt.untagged_union_def.name.text,
  )
  return {
    kind: "UnionDef",
    name: mangle_union_name(full_name),
    fields,
  }
}

function get_module_of_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: Expr,
): ValueDeclOfKind<"Module"> | null {
  if (expr.kind !== "Var") return null
  assert(expr.kind === "Var", "Property access lhs must be a variable")

  const lhs_decl = ctx.resolve_result.values
    .get(source_file.path)
    ?.get(expr.ident)
  if (!lhs_decl) return null

  if (lhs_decl.kind === "Module") return lhs_decl
  else return null
}
function emit_prop_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: PropExpr,
): CNode {
  const lhs_module = get_module_of_expr(ctx, source_file, expr.lhs)
  if (lhs_module) {
    const prop_decl = lhs_module.values.get(expr.property.text)
    assert(prop_decl)
    let name: string
    switch (prop_decl.kind) {
      case "LJSExternConst":
      case "LJSExternFunction":
        name = prop_decl.stmt.name.text
        break
      case "Func": {
        assert(prop_decl.func.name)
        const func_name = prop_decl.func.name.text
        const module_source_file = [...ctx.source_files.values()].find((sf) =>
          sf.stmts.some(
            (stmt) =>
              stmt.kind === "Func" && stmt.func.name?.text === func_name,
          ),
        )
        assert(module_source_file, "Could not find source file for function")
        name = mangle_func_name(module_source_file, func_name)
        break
      }
      case "BuiltinConst":
        PANIC(`${prop_decl.name} should be handled elsewhere`)
      case "VarDecl": {
        const declarator = ctx.tc_result.var_decls
          .get(prop_decl.decl)
          ?.find((d) => d.name === expr.property.text)
        assert(declarator, "VarDecl must have a matching declarator")
        if (
          declarator.init.kind === "Number" &&
          declarator.decl_type === "Const"
        ) {
          return emit_expr(ctx, source_file, declarator.init)
        }
      }
      default:
        TODO([prop_decl])
        PANIC(`Unhandled declaration in emit_prop_expr: ${expr.kind};`)
    }

    return { kind: "Ident", name }
  } else {
    const lhs_ty = ctx.tc_result.values.get(expr.lhs)
    assert(lhs_ty)
    if (lhs_ty.kind === "StructInstance") {
      return {
        kind: "Prop",
        lhs: emit_expr(ctx, source_file, expr.lhs),
        rhs: expr.property.text,
      }
    } else if (
      type_is_pointer(lhs_ty) &&
      lhs_ty.type.kind === "StructInstance"
    ) {
      return {
        kind: "BinOp",
        op: "->",
        left: emit_expr(ctx, source_file, expr.lhs),
        right: { kind: "Ident", name: expr.property.text },
      }
    } else {
      PANIC(`Unhandled lhs type in property access: ${lhs_ty.kind}`)
    }
  }
}

function emit_tagged_template_literal_expr(
  ctx: EmitContext,
  expr: TaggedTemplateLiteralExpr,
): CNode {
  const tag_type = ctx.tc_result.values.get(expr.tag)
  assert(
    tag_type?.kind === "CStringConstructor",
    "Tagged template literal tag must be CStringConstructor",
  )

  assert(
    expr.fragments.length === 1,
    "Expected exactly one fragment in tagged template literal",
  )
  const fragment = expr.fragments[0]
  assert(
    fragment.kind === "Text",
    "Expected text fragment in tagged template literal",
  )

  // Remove the backticks from the fragment text and treat as string literal
  let text = fragment.text
  if (text.startsWith("`") && text.endsWith("`")) {
    text = `"${text.slice(1, -1)}"`
  }

  const content = evaluate_string_literal(text)
  return { kind: "StringLiteral", value: content }
}

function evaluate_string_literal(raw_text: string): string {
  // Remove quotes and evaluate escape sequences
  if (raw_text.startsWith('"') && raw_text.endsWith('"')) {
    return raw_text
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
  }
  if (raw_text.startsWith("'") && raw_text.endsWith("'")) {
    return raw_text
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\")
  }
  return raw_text
}

function render_c_nodes(nodes: CNode[]): string {
  return nodes.map(render_c_node).join("\n\n")
}

function render_c_node(node: CNode): string {
  switch (node.kind) {
    case "Ident":
      return node.name
    case "Block":
      return `{\n${node.body
        .map((n) => "  " + render_c_node(n).split("\n").join("\n  "))
        .join("\n")}\n}`
    case "Concat":
      return node.items.map(render_c_node).join(" ")
    case "LineComment":
      return `// ${node.text}`
    case "FuncForwardDecl":
      return `${render_c_node(node.returns)} ${node.name}(${node.params
        .map(render_c_node)
        .join(", ")});`
    case "Param":
      return `${render_c_node(node.type)} ${node.name}`
    case "ConstPtr":
      return `const ${render_c_node(node.to_type)}*`
    case "Ptr":
      return `${render_c_node(node.to_type)}*`
    case "VarDecl":
      const array_size = node.array_size !== null ? `[${node.array_size}]` : ""
      if (node.init) {
        return `${render_c_node(node.type)} ${node.name}${array_size} = ${render_c_node(
          node.init,
        )};`
      } else {
        return `${render_c_node(node.type)} ${node.name}${array_size};`
      }

    case "FuncDef":
      return `${render_c_node(node.returns)} ${node.name}(${node.params
        .map(render_c_node)
        .join(", ")}) ${render_c_node(node.body)}`
    case "ExternFunc":
      return `extern ${render_c_node(node.returns)} ${node.name}(${node.params
        .map(render_c_node)
        .join(", ")});`
    case "ExternConst":
      return `extern ${render_c_node(node.type)} ${node.name};`
    case "Return":
      return node.value ? `return ${render_c_node(node.value)};` : "return;"
    case "Call":
      return `${render_c_node(node.func)}(${node.args
        .map(render_c_node)
        .join(", ")})`
    case "StringLiteral":
      return `"${node.value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")}"`
    case "IntLiteral":
      return node.value.toString()
    case "ExprStmt":
      return `${render_c_node(node.expr)};`
    case "Prop":
      return `${render_c_node(node.lhs)}.${node.rhs}`
    case "Cast":
      return `((${render_c_node(node.to)})${render_c_node(node.expr)})`
    case "StructInit":
      return `{ ${node.fields
        .map((f) => `.${f.key} = ${render_c_node(f.value)}`)
        .join(", ")} }`
    case "UnionInit":
      return `{ .${node.field} = ${render_c_node(node.value)} }`
    case "StructTypeRef":
      return `struct ${node.name}`
    case "UnionTypeRef":
      return `union ${node.name}`
    case "Typedef":
      return `typedef ${render_c_node(node.to)} ${node.name};`
    case "StructDef":
      return `struct ${node.name} {\n${node.fields
        .map((f) => `  ${render_c_node(f.type)} ${f.name};`)
        .join("\n")}\n};`
    case "StructDecl":
      return `struct ${node.name};`
    case "UnionDef":
      return `union ${node.name} {\n${node.fields
        .map((f) => `  ${render_c_node(f.type)} ${f.name};`)
        .join("\n")}\n};`
    case "UnionDecl":
      return `union ${node.name};`
    case "Many":
      return node.nodes.map(render_c_node).join("\n")
    case "While":
      return `while (${render_c_node(node.condition)}) ${render_c_node(
        node.body,
      )}`
    case "BinOp":
      return `(${render_c_node(node.left)} ${node.op} ${render_c_node(
        node.right,
      )})`
    case "Label":
      return `${node.text}:`
    case "PostIncrement":
      return `(${render_c_node(node.expr)}++)`
    case "PostDeclrement":
      return `(${render_c_node(node.expr)}--)`
    case "EmptyStmt":
      return ";"
    case "If":
      return `if (${render_c_node(node.condition)}) ${render_c_node(
        node.if_true,
      )}${node.if_false ? ` else ${render_c_node(node.if_false)}` : ""}`
    case "Break":
      return "break;"
    case "Continue":
      return "continue;"
    case "AddressOf":
      return `(&${render_c_node(node.expr)})`
    case "Deref":
      return `(*${render_c_node(node.expr)})`
    case "Not": {
      return `(!${render_c_node(node.expr)})`
    }
    case "...":
      return "..."
    case "Empty":
      return ""
    case "Ternary":
      return `(${render_c_node(node.condition)} ? ${render_c_node(
        node.then_branch,
      )} : ${render_c_node(node.else_branch)})`
    default:
      assert_never(node)
  }
}

export type CNode =
  | { kind: "Empty" }
  | { kind: "Ident"; name: string }
  | { kind: "Block"; body: CNode[] }
  | { kind: "Concat"; items: CNode[] }
  | { kind: "LineComment"; text: string }
  | {
      kind: "FuncForwardDecl"
      name: string
      params: CNode[]
      returns: CNode
    }
  | { kind: "Param"; name: string; type: CNode; array_size: number | null }
  | { kind: "ConstPtr"; to_type: CNode }
  | { kind: "Ptr"; to_type: CNode }
  | {
      kind: "VarDecl"
      type: CNode
      name: string
      init: CNode | null
      array_size: number | null
    }
  | {
      kind: "FuncDef"
      name: string
      params: CNode[]
      returns: CNode
      body: CNode
    }
  | { kind: "ExternFunc"; name: string; params: CNode[]; returns: CNode }
  | { kind: "ExternConst"; name: string; type: CNode }
  | { kind: "Return"; value: CNode | null }
  | { kind: "Call"; func: CNode; args: CNode[] }
  | { kind: "StringLiteral"; value: string }
  | { kind: "IntLiteral"; value: number }
  | { kind: "ExprStmt"; expr: CNode }
  | { kind: "Prop"; lhs: CNode; rhs: string }
  | { kind: "StructInit"; fields: { key: string; value: CNode }[] }
  | { kind: "UnionInit"; field: string; value: CNode }
  | { kind: "Cast"; to: CNode; expr: CNode }
  /**
   * The type `struct Foo`
   * in the following stmt
   * struct Foo foo;
   */
  | { kind: "StructTypeRef"; name: string }
  /**
   * The type `union Foo`
   * in the following stmt
   * union Foo foo;
   */
  | { kind: "UnionTypeRef"; name: string }
  | { kind: "Typedef"; name: string; to: CNode }
  | { kind: "StructDecl"; name: string }
  | {
      kind: "StructDef"
      name: string
      fields: { name: string; type: CNode; array_size: number | null }[]
    }
  | { kind: "UnionDecl"; name: string }
  | { kind: "UnionDef"; name: string; fields: { name: string; type: CNode }[] }
  | { kind: "Many"; nodes: CNode[] }
  | { kind: "While"; condition: CNode; body: CNode }
  | { kind: "BinOp"; op: string; left: CNode; right: CNode }
  | { kind: "Label"; text: string }
  | { kind: "PostIncrement"; expr: CNode }
  | { kind: "PostDeclrement"; expr: CNode }
  | { kind: "EmptyStmt" }
  | { kind: "If"; condition: CNode; if_true: CNode; if_false: CNode | null }
  | { kind: "Break" }
  | { kind: "Continue" }
  | { kind: "AddressOf"; expr: CNode }
  | { kind: "Deref"; expr: CNode }
  | { kind: "Not"; expr: CNode }
  | { kind: "..." }
  | {
      kind: "Ternary"
      condition: CNode
      then_branch: CNode
      else_branch: CNode
    }
