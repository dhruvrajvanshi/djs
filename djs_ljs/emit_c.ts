import {
  ASTVisitorBase,
  Expr,
  FuncStmt,
  LJSExternFunctionStmt,
  sexpr_to_string,
  Stmt,
  stmt_to_sexpr,
  type_annotation_to_sexpr,
  TypeAnnotation,
  VarDeclStmt,
  type SourceFile,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { todo } from "djs_std"
import assert from "node:assert"
import { type TypecheckResult } from "./typecheck.ts"
import type { Type } from "./type.ts"

export function emit_c(source_files: SourceFiles, tc_result: TypecheckResult) {
  const emit_decls = new EmitDeclarations(tc_result)
  for (const source_file of source_files.values()) {
    emit_decls.visit_source_file(source_file)
  }
  console.log("---- emit_c ----")
  console.log(emit_decls.nodes.map(pp_c_node).join("\n"))
  console.log("----------------")

  todo()
}

export type CNode =
  | { kind: "Ident"; name: string }
  | { kind: "Block"; body: CNode[] }
  | { kind: "Concat"; items: CNode[] }
  | { kind: "LineComment"; text: string }
  | {
      kind: "FuncDecl"
      name: string
      params: CNode[]
      returns: CNode
    }
  | { kind: "Param"; name: string; type: CNode }
  | { kind: "ConstPtr"; to_type: CNode }
  | { kind: "Ptr"; to_type: CNode }
  | { kind: "VarDecl"; type: CNode; name: string; init: CNode }

const CNode = {
  Ident: (name: string): CNode => ({ kind: "Ident", name }),
  void: { kind: "Ident", name: "void" },
  Param: (name: string, type: CNode = CNode.Ident("void")): CNode => ({
    kind: "Param",
    name,
    type,
  }),
} satisfies Record<string, CNode | ((...args: never[]) => CNode)>

function pp(
  template: TemplateStringsArray,
  ...args: (CNode | string | CNode[])[]
): string {
  let result = ""
  for (let i = 0; i < template.length; i++) {
    const str = template[i]
    const arg = args[i]
    result += str
    if (Array.isArray(arg)) {
      result += arg.map(pp_c_node).join(", ")
    } else if (typeof arg === "string") {
      result += arg
    } else if (arg) {
      result += pp_c_node(arg)
    }
  }
  return result
}
function pp_c_node(node: CNode): string {
  switch (node.kind) {
    case "Ident":
      return node.name
    case "Block":
      return `{ ${node.body.map(pp_c_node).join("; ")} }`
    case "FuncDecl":
      return pp`${node.returns} ${node.name}(${node.params.map(pp_c_node).join(", ")});`
    case "Param":
      return pp`${node.type} ${node.name}`
    case "Concat":
      return node.items.map(pp_c_node).join("\n")
    case "LineComment":
      return `// ${node.text}\n`
    case "ConstPtr":
      return pp`const ${pp_c_node(node.to_type)}*`
    case "Ptr":
      return pp`${node.to_type}*`
    case "VarDecl":
      return pp`${node.type} ${node.name} = ${node.init}`
  }
}

class EmitDeclarations extends ASTVisitorBase {
  nodes: CNode[] = []
  tc_result: TypecheckResult
  constructor(tc_result: TypecheckResult) {
    super()
    this.tc_result = tc_result
  }

  override visit_source_file(node: SourceFile): void {
    this.nodes.push({
      kind: "LineComment",
      text: `File: ${node.path}`,
    })
    super.visit_source_file(node)
  }
  override visit_stmt(node: Stmt): void {
    switch (node.kind) {
      case "Func":
        return emit_func_decl(this.nodes, node, this.tc_result)
      case "ImportStarAs":
        break
      case "Import":
        break
      case "LJSExternFunction":
        return emit_extern_func_decl(this.nodes, node, this.tc_result)
      case "VarDecl":
        return emit_var_decl(this.nodes, node, this.tc_result)
      case "TypeAlias":
        return
      default:
        return todo`emit_c: unhandled stmt kind: ${node.kind} ${stmt_to_sexpr(node)}`
    }
  }
}
function emit_var_decl(to: CNode[], node: VarDeclStmt, tc: TypecheckResult) {
  const decls = tc.var_decls.get(node)
  assert(decls)
  for (const decl of decls) {
    if (decl.type.kind === "CStringConstructor") {
      // const cstr = @builtin("cstring")
      continue
    }
    const ty = lower_type(decl.type)

    to.push({
      kind: "VarDecl",
      type: ty,
      name: decl.name,
      init: lower_expr(decl.init),
    })
  }
}
function lower_type(ty: Type): CNode {
  switch (ty.kind) {
    case "void":
      return CNode.void
    case "Ptr":
      return { kind: "ConstPtr", to_type: lower_type(ty.type) }
    case "MutPtr":
      return { kind: "Ptr", to_type: lower_type(ty.type) }
    case "c_char":
      return CNode.Ident("char")
    default:
      todo(ty.kind)
  }
}
function lower_expr(expr: Expr): CNode {
  switch (expr.kind) {
    default:
      todo(expr.kind)
  }
}

function emit_extern_func_decl(
  to: CNode[],
  node: LJSExternFunctionStmt,
  tc: TypecheckResult,
) {
  assert(node.name, "Function must have a name")
  assert(node.return_type, "Function must have a return type")
  to.push({
    kind: "FuncDecl",
    name: node.name.text,
    params: node.params.map((param) => {
      assert(param.pattern.kind === "Var")
      assert(param.type_annotation)

      return CNode.Param(
        param.pattern.ident.text,
        lower_annotation(param.type_annotation, tc),
      )
    }),
    returns: lower_annotation(node.return_type, tc),
  })
}
function emit_func_decl(to: CNode[], node: FuncStmt, tc: TypecheckResult) {
  assert(node.func.name, "Function must have a name")
  assert(node.func.return_type, "Function must have a return type")

  to.push({
    kind: "FuncDecl",
    name: node.func.name.text,
    params: node.func.params.map((param) => {
      assert(param.pattern.kind === "Var")
      assert(param.type_annotation)

      return CNode.Param(
        param.pattern.ident.text,
        lower_annotation(param.type_annotation, tc),
      )
    }),
    returns: lower_annotation(node.func.return_type, tc),
  })
}
function lower_annotation(
  annotation: TypeAnnotation,
  tc: TypecheckResult,
): CNode {
  const type = tc.types.get(annotation)
  assert(
    type,
    `Type not found for annotation: ${sexpr_to_string(type_annotation_to_sexpr(annotation))}`,
  )
  return lower_type(type)
}
