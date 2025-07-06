import {
  ASTVisitorBase,
  FuncStmt,
  IdentTypeAnnotation,
  LJSExternFunctionStmt,
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
import { flatten_var_decl } from "./flatten_var_decl.ts"

export function emit_c(source_files: SourceFiles) {
  const emit_decls = new EmitDeclarations()
  for (const source_file of source_files.values()) {
    emit_decls.visit_source_file(source_file)
  }
  console.dir(emit_decls.nodes)
  console.log("---- emit_c ----")
  console.log(emit_decls.nodes.map(pp_c_node).join("\n"))
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

const CNode = {
  Ident: (name: string): CNode => ({ kind: "Ident", name }),
  void: { kind: "Ident", name: "void" },
  Param: (name: string, type: CNode = CNode.Ident("void")): CNode => ({
    kind: "Param",
    name,
    type,
  }),
}

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
      return pp`${pp_c_node(node.to_type)}*`
  }
}

class EmitDeclarations extends ASTVisitorBase {
  nodes: CNode[] = []
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
        return emit_func_decl(this.nodes, node)
      case "ImportStarAs":
        break
      case "Import":
        break
      case "LJSExternFunction":
        return emit_extern_func_decl(this.nodes, node)
      case "VarDecl":
        return emit_var_decl(this.nodes, node)
      default:
        return todo`emit_c: unhandled stmt kind: ${node.kind} ${stmt_to_sexpr(node)}`
    }
  }
}
function emit_var_decl(to: CNode[], node: VarDeclStmt) {
  todo`emit_c: unhandled VarDeclStmt: ${stmt_to_sexpr(node)}`
}
function emit_extern_func_decl(to: CNode[], node: LJSExternFunctionStmt) {
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
        lower_annotation(param.type_annotation),
      )
    }),
    returns: lower_annotation(node.return_type),
  })
}
function emit_func_decl(to: CNode[], node: FuncStmt) {
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
        lower_annotation(param.type_annotation),
      )
    }),
    returns: lower_annotation(node.func.return_type),
  })
}
function lower_annotation(ty: TypeAnnotation): CNode {
  switch (ty.kind) {
    case "Ident":
      return lower_var_annotation(ty)
    case "LJSConstPtr":
      return { kind: "ConstPtr", to_type: lower_annotation(ty.to) }
    case "LJSPtr":
      return { kind: "Ptr", to_type: lower_annotation(ty.to) }
    default:
      return todo`emit_c: unhandled type annotation kind: ${type_annotation_to_sexpr(ty)}`
  }
}
function lower_var_annotation(ty: IdentTypeAnnotation): CNode {
  switch (ty.ident.text) {
    case "void":
      return CNode.Ident("void")
    case "u8":
      return CNode.Ident("uint8_t")
    default:
      return todo`Unhandled anotation: ${type_annotation_to_sexpr(ty)}`
  }
}
