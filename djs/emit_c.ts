import type { SourceFiles } from "./SourceFiles.ts"
import { assert_never, defer, PANIC, TODO } from "djs_std"
import { type TypecheckResult } from "./typecheck.ts"
import {
  type Expr,
  type Stmt,
  type FuncStmt,
  type PropExpr,
  type TypeAnnotation,
  type Block,
  type Param,
  type SourceFile,
  type ForStmt,
  type BinOp,
  type IfStmt,
  type WhileStmt,
  type DoWhileStmt,
  type ForInOrOfStmt,
  type ReturnStmt,
  type ContinueStmt,
  type AssignExpr,
  QualifiedName,
} from "djs_ast"
import assert from "node:assert"
import { Type } from "./type.ts"
import type { ResolveResult } from "./resolve.ts"
import type { ModuleDecl } from "./decl.ts"

interface EmitContext {
  source_files: SourceFiles
  tc_result: TypecheckResult
  resolve_result: ResolveResult
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
  resolve_result: ResolveResult,
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

        forward_decls.push({
          kind: "FuncForwardDecl",
          name: mangle_func_name(source_file, func_name),
          params,
          returns: return_type,
        })
        TODO()
        break
      }
    }
  }

  for (const source_file of source_files.values()) {
    const body = source_file.stmts.map((stmt) =>
      emit_stmt(ctx, source_file, stmt),
    )
    defs.push({
      kind: "FuncDef",
      name: mangle_func_name(source_file, "module_init"),
      params: [
        {
          kind: "Param",
          name: "djs_runtime",
          type: { kind: "Ident", name: "DJSRuntime*" } as CNode,
          array_size: null,
        },
      ],
      returns: { kind: "Ident", name: "void" },
      body: { kind: "Block", body },
    })
  }

  defs.push({
    kind: "FuncDef",
    name: "main",
    params: [],
    returns: { kind: "Ident", name: "int" },
    body: {
      kind: "Block",
      body: [{ kind: "Return", value: { kind: "IntLiteral", value: 0 } }],
    },
  })

  const c_nodes: CNode[] = [...forward_decls, ...defs]

  return {
    source: PRELUDE + render_c_nodes(c_nodes),
    linkc_paths: ctx.link_c_paths,
  }
}
const PRELUDE = `
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "djs.h"

DJSCompletion djs_console_log(DJSRuntime* djs_runtime, DJSValue this_arg, DJSValue* args, size_t arg_count) {
}
`

function types_first(
  { stmt: a }: { stmt: Stmt },
  { stmt: b }: { stmt: Stmt },
): number {
  const is_type_decl = (kind: Stmt["kind"]) => false
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

    return {
      kind: "Param",
      name: param_name,
      type: emit_type(type_obj),
      array_size: null,
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
    case "boolean":
      return { kind: "Ident", name: "bool" }
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
  const body = emit_block(ctx, source_file, func_stmt.func.body)
  ctx.implicit_return_value = null

  return {
    kind: "FuncDef",
    name: mangle_func_name(source_file, func_name),
    params,
    returns: return_type,
    body,
  }
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

      const decl_nodes = var_decls.map((decl): CNode => {
        const init_ty = ctx.tc_result.values.get(decl.init)
        assert(init_ty, "VarDecl init must have a type")
        const init_expr = emit_expr(ctx, source_file, decl.init)

        return {
          kind: "VarDecl",
          type: emit_type(decl.type),
          name: decl.name,
          init: init_expr,
          array_size: null,
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
    stmts.push({
      kind: "VarDecl",
      type: emit_type(decl.type),
      name: decl.name,
      init: init_expr,
      array_size: null,
    })
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
      const func = emit_expr(ctx, source_file, expr.callee)
      const args = expr.args.map((arg) => emit_expr(ctx, source_file, arg))
      return { kind: "Call", func, args }
    }
    case "String": {
      const evaluated_string = evaluate_string_literal(expr.text)
      return {
        kind: "Call",
        func: { kind: "Ident", name: "djs_string_new" },
        args: [
          { kind: "Ident", name: "djs_runtime" },
          { kind: "StringLiteral", value: evaluated_string },
        ],
      }
    }
    case "Number": {
      const num_value = Number(expr.text)
      return { kind: "IntLiteral", value: num_value }
    }
    case "Boolean": {
      return { kind: "Ident", name: expr.value ? "true" : "false" }
    }
    case "Prop": {
      return emit_prop_expr(ctx, source_file, expr)
    }
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
        Mul: "*",
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
    case "As": {
      const target_type = ctx.tc_result.types.get(expr.type_annotation)
      assert(target_type, "Target type must be available")
      return {
        kind: "Cast",
        to: emit_type(target_type),
        expr: emit_expr(ctx, source_file, expr.expr),
      }
    }
    case "Null": {
      TODO()
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
    case "Paren": {
      return emit_expr(ctx, source_file, expr.expr)
    }
    case "UnaryMinus": {
      const expr_node = emit_expr(ctx, source_file, expr.expr)
      return {
        kind: "PrefixOp",
        op: "-",
        expr: expr_node,
      }
    }
    case "UnaryPlus": {
      const expr_node = emit_expr(ctx, source_file, expr.expr)
      return {
        kind: "PrefixOp",
        op: "+",
        expr: expr_node,
      }
    }
    case "DJSIntrinsic": {
      switch (expr.name) {
        case "djs_console_log":
          return { kind: "Ident", name: "djs_console_log" }
        default:
          PANIC(`Unhandled DJS intrinsic: ${expr.name}`)
      }
    }
    default:
      TODO(`Unhandled expression: ${expr.kind}`)
  }
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
  } else if (
    expr.pattern.kind === "Prop" &&
    expr.pattern.key.kind === "Ident"
  ) {
    TODO()
  } else {
    return TODO`Unsupported assignment expr ${expr}`
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

function get_module_of_expr(ctx: EmitContext, expr: Expr): ModuleDecl | null {
  if (expr.kind !== "Var") return null
  assert(expr.kind === "Var", "Property access lhs must be a variable")

  const lhs_decl = ctx.resolve_result.values.get(expr.ident)
  if (!lhs_decl) return null

  if (lhs_decl.kind === "Module") return lhs_decl
  else return null
}
function emit_prop_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: PropExpr,
): CNode {
  const lhs_module = get_module_of_expr(ctx, expr.lhs)
  if (lhs_module) {
    const prop_decl = lhs_module.values.get(expr.property.text)
    assert(prop_decl)
    let name: string
    switch (prop_decl.kind) {
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
    TODO()
  }
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
      return `${render_c_node(node.to_type)} const*`
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
        .map(
          (f) =>
            `  ${render_c_node(f.type)} ${f.name}${f.array_size !== null ? `[${f.array_size}]` : ""};`,
        )
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
    case "PrefixOp":
      return `(${node.op}${render_c_node(node.expr)})`
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
      fields: CStructDefField[]
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
  | { kind: "PrefixOp"; op: string; expr: CNode }
  | {
      kind: "Ternary"
      condition: CNode
      then_branch: CNode
      else_branch: CNode
    }

interface CStructDefField {
  name: string
  type: CNode
  array_size: number | null
}
