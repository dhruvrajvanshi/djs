import type { SourceFiles } from "./SourceFiles.ts"
import { assert_never, todo } from "djs_std"
import { type TypecheckResult } from "./typecheck.ts"
import type { ResolveImportsResult } from "./resolve_imports.ts"
import type {
  Expr,
  Stmt,
  FuncStmt,
  TaggedTemplateLiteralExpr,
  PropExpr,
  TypeAnnotation,
  Block,
  Param,
  SourceFile,
  StructInitExpr,
} from "djs_ast"
import assert from "node:assert"
import { Type } from "./type.ts"
import type { ValueDeclOfKind } from "./SymbolTable.ts"

interface EmitContext {
  source_files: SourceFiles
  tc_result: TypecheckResult
  resolve_result: ResolveImportsResult
}

/**
 * @returns C source code
 */
export function emit_c(
  source_files: SourceFiles,
  tc_result: TypecheckResult,
  resolve_result: ResolveImportsResult,
): string {
  const ctx: EmitContext = { source_files, tc_result, resolve_result }

  // Phase 1: Collect forward declarations
  const forward_decls: CNode[] = []
  const defs: CNode[] = []

  const all_stmts = [...source_files.values()].flatMap((sf) =>
    sf.stmts.map((stmt) => ({ stmt, source_file: sf })),
  )
  for (const { stmt } of [...all_stmts].sort(types_first)) {
    switch (stmt.kind) {
      case "Func": {
        const func_name = stmt.func.name?.text
        assert(func_name, "Function must have a name")

        const params = stmt.func.params.map((param) => emit_param(ctx, param))
        const return_type = stmt.func.return_type
          ? emit_type_annotation(ctx, stmt.func.return_type)
          : ({ kind: "Ident", name: "void" } as CNode)

        forward_decls.push({
          kind: "FuncForwardDecl",
          name: func_name,
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
      case "StructDecl": {
        forward_decls.push(emit_struct_decl(stmt))
      }
    }
  }

  // Phase 2: Emit function definitions
  for (const { stmt, source_file } of [...all_stmts].sort(types_first)) {
    if (stmt.kind === "Func") {
      defs.push(emit_func_def(ctx, source_file, stmt))
    } else if (stmt.kind === "StructDecl") {
      defs.push(emit_struct_def(ctx, stmt))
    }
  }

  const c_nodes: CNode[] = [...forward_decls, ...defs]

  return render_c_nodes(c_nodes)
}
function emit_struct_decl(stmt: Stmt): CNode {
  assert(stmt.kind === "StructDecl")
  return {
    kind: "StructDecl",
    name: mangle_struct_name([stmt.struct_def.name.text]),
  }
}
function emit_struct_def(ctx: EmitContext, stmt: Stmt): CNode {
  assert(stmt.kind === "StructDecl")
  const fields = stmt.struct_def.members.map((member) => {
    return {
      name: member.name.text,
      type: emit_type_annotation(ctx, member.type_annotation),
    }
  })
  return {
    kind: "StructDef",
    name: mangle_struct_name([stmt.struct_def.name.text]),
    fields,
  }
}

function types_first(
  { stmt: a }: { stmt: Stmt },
  { stmt: b }: { stmt: Stmt },
): number {
  if (a.kind === "StructDecl" && b.kind !== "StructDecl") return -1
  if (a.kind !== "StructDecl" && b.kind === "StructDecl") return 1
  return 0
}

function emit_param(ctx: EmitContext, param: Param): CNode {
  assert(param.pattern.kind === "Var", "Param pattern must be a variable")
  const param_name = param.pattern.ident.text
  const param_type = param.type_annotation
    ? emit_type_annotation(ctx, param.type_annotation)
    : ({ kind: "Ident", name: "void" } as CNode)

  return {
    kind: "Param",
    name: param_name,
    type: param_type,
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
    case "i32":
      return { kind: "Ident", name: "int32_t" }
    case "u32":
      return { kind: "Ident", name: "uint32_t" }
    case "Ptr":
      return { kind: "ConstPtr", to_type: emit_type(type.type) }
    case "MutPtr":
      return { kind: "Ptr", to_type: emit_type(type.type) }
    case "StructInstance":
      return {
        kind: "StructTypeRef",
        name: mangle_struct_name(type.qualified_name),
      }
    default:
      todo(`Unhandled type: ${type.kind}`)
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
  const return_type = func_stmt.func.return_type
    ? emit_type_annotation(ctx, func_stmt.func.return_type)
    : ({ kind: "Ident", name: "void" } as CNode)
  const body = emit_block(ctx, source_file, func_stmt.func.body)

  return {
    kind: "FuncDef",
    name: func_name,
    params,
    returns: return_type,
    body,
  }
}

function emit_block(
  ctx: EmitContext,
  source_file: SourceFile,
  block: Block,
): CNode {
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

      if (var_decls.length === 1) {
        const decl = var_decls[0]
        const var_type = emit_type(decl.type)
        const init_expr = emit_expr(ctx, source_file, decl.init)

        return {
          kind: "VarDecl",
          type: var_type,
          name: decl.name,
          init: init_expr,
        }
      } else {
        const decl_nodes = var_decls.map((decl) => {
          const var_type = emit_type(decl.type)
          const init_expr = emit_expr(ctx, source_file, decl.init)

          return {
            kind: "VarDecl",
            type: var_type,
            name: decl.name,
            init: init_expr,
          } as CNode
        })

        return { kind: "Block", body: decl_nodes }
      }
    }
    case "Return": {
      const value = stmt.value ? emit_expr(ctx, source_file, stmt.value) : null
      return { kind: "Return", value }
    }
    case "Expr": {
      const expr = emit_expr(ctx, source_file, stmt.expr)
      return { kind: "ExprStmt", expr }
    }
    default:
      todo(`Unhandled statement: ${stmt.kind}`)
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
      return { kind: "StringLiteral", value: evaluated_string }
    }
    case "Number": {
      const num_value = Number(expr.text)
      return { kind: "IntLiteral", value: num_value }
    }
    case "TaggedTemplateLiteral": {
      return emit_tagged_template_literal_expr(ctx, expr)
    }
    case "Prop": {
      return emit_prop_expr(ctx, source_file, expr)
    }
    case "StructInit":
      return emit_struct_init_expr(ctx, source_file, expr)
    default:
      todo(`Unhandled expression: ${expr.kind}`)
  }
}
function emit_struct_init_expr(
  ctx: EmitContext,
  source_file: SourceFile,
  expr: StructInitExpr,
): CNode {
  const instance_type = ctx.tc_result.values.get(expr)
  const lhs_type = ctx.tc_result.values.get(expr.lhs)
  assert(instance_type?.kind === "StructInstance")
  assert(lhs_type?.kind === "StructConstructor")
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
}
function mangle_struct_name(qualified_name: readonly string[]): string {
  if (qualified_name.length !== 1) {
    todo()
  }
  return qualified_name[0]
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
    assert(
      prop_decl?.kind === "LJSExternFunction",
      "Property must be an extern function",
    )

    return { kind: "Ident", name: prop_decl.stmt.name.text }
  } else {
    const lhs_ty = ctx.tc_result.values.get(expr.lhs)
    assert(lhs_ty)
    assert(lhs_ty.kind === "StructInstance")
    const prop_ty = lhs_ty.fields[expr.property.text]
    return {
      kind: "Prop",
      lhs: emit_expr(ctx, source_file, expr.lhs),
      rhs: expr.property.text,
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
      return `${render_c_node(node.type)} ${node.name} = ${render_c_node(
        node.init,
      )};`
    case "FuncDef":
      return `${render_c_node(node.returns)} ${node.name}(${node.params
        .map(render_c_node)
        .join(", ")}) ${render_c_node(node.body)}`
    case "ExternFunc":
      return `extern ${render_c_node(node.returns)} ${node.name}(${node.params
        .map(render_c_node)
        .join(", ")});`
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
    case "StructTypeRef":
      return `struct ${node.name}`
    case "Typedef":
      return `typedef ${render_c_node(node.to)} ${node.name};`
    case "StructDef":
      return `struct ${node.name} {\n${node.fields
        .map((f) => `  ${render_c_node(f.type)} ${f.name};`)
        .join("\n")}\n};`
    case "StructDecl":
      return `struct ${node.name};`
    default:
      assert_never(node)
  }
}

export type CNode =
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
  | { kind: "Param"; name: string; type: CNode }
  | { kind: "ConstPtr"; to_type: CNode }
  | { kind: "Ptr"; to_type: CNode }
  | { kind: "VarDecl"; type: CNode; name: string; init: CNode }
  | {
      kind: "FuncDef"
      name: string
      params: CNode[]
      returns: CNode
      body: CNode
    }
  | { kind: "ExternFunc"; name: string; params: CNode[]; returns: CNode }
  | { kind: "Return"; value: CNode | null }
  | { kind: "Call"; func: CNode; args: CNode[] }
  | { kind: "StringLiteral"; value: string }
  | { kind: "IntLiteral"; value: number }
  | { kind: "ExprStmt"; expr: CNode }
  | { kind: "Prop"; lhs: CNode; rhs: string }
  | { kind: "StructInit"; fields: { key: string; value: CNode }[] }
  | { kind: "Cast"; to: CNode; expr: CNode }
  /**
   * The type `struct Foo`
   * in the following stmt
   * struct Foo foo;
   */
  | { kind: "StructTypeRef"; name: string }
  | { kind: "Typedef"; name: string; to: CNode }
  | { kind: "StructDecl"; name: string }
  | { kind: "StructDef"; name: string; fields: { name: string; type: CNode }[] }
