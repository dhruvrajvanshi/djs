import { ASTVisitorBase, FuncStmt, Stmt } from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { todo } from "djs_std"
import assert, { AssertionError } from "node:assert"

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
  }
}

export function emit_c(source_files: SourceFiles) {
  const emit_decls = new EmitDeclarations()
  for (const source_file of source_files.values()) {
    emit_decls.visit_source_file(source_file)
  }
  console.dir(emit_decls.nodes)
  console.log("---- emit_c ----")
  console.log(emit_decls.nodes.map(pp_c_node).join("\n"))
}

class EmitDeclarations extends ASTVisitorBase {
  nodes: CNode[] = []
  override visit_stmt(node: Stmt): void {
    switch (node.kind) {
      case "Func":
        emit_func_decl(this.nodes, node)
      case "ImportStarAs":
        break
      case "Import":
        break
      default:
        todo(`emit_c: unhandled stmt kind: ${node.kind}`)
    }
  }
}
function emit_func_decl(to: CNode[], node: FuncStmt) {
  assert(node.func.name, "Function must have a name")
  to.push({
    kind: "FuncDecl",
    name: node.func.name.text,
    params: [{ kind: "Param", name: "TODO", type: CNode.Ident("TODO") }],
    returns: CNode.Ident("TODO"),
  })
}
