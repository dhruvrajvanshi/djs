import { Expr, SourceFile, Stmt } from "./ast.gen"
import assert from "node:assert"

export function pretty_print(source_file: SourceFile): string {
  return source_file.stmts.map(pp_stmt_or_expr).join("\n")
}

function pp(template: TemplateStringsArray, ...args: (Stmt | Expr)[]): string {
  return template
    .map((str, i) => str + (args[i] ? pp_stmt_or_expr(args[i]) : ""))
    .join("")
}
function pp_stmt_or_expr(item: Stmt | Expr): string {
  switch (item.kind) {
    case "If":
      if (item.if_false) {
        return pp`if (${item.condition}) ${item.if_true} else ${item.if_false}`
      } else {
        return pp`if (${item.condition}) ${item.if_true}`
      }
    case "Expr":
      return pp`${item.expr};`
    case "Var":
      return item.ident.text
    case "ParseError":
      return `#PARSE_ERROR`
    default:
      assert(false, `TODO: ${item.kind}`)
  }
}
