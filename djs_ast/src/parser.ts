import { Expr, SourceFile, Stmt } from "./ast.gen"
import { Lexer } from "./lexer"
import { TokenKind } from "./TokenKind"

interface Parser {
  parse_source_file(): SourceFile
  parse_expr(): Expr
}
export function Parser(source: string): Parser {
  return parser_impl(Lexer(source))
}

const t = TokenKind
function parser_impl(_lexer: Lexer): Parser {
  let lexer = _lexer
  let current_token = lexer.next()
  return { parse_source_file, parse_expr }

  function parse_expr(): Expr {
    throw new Error(`Not implemented: ${current_kind()}`)
  }

  function parse_source_file(): SourceFile {
    const stmts: Stmt[] = []
    const span = current_token.span
    while (!at(t.EndOfFile)) {
      const stmt = parse_stmt()
      if (stmt) {
        stmts.push(stmt)
      }
    }
    return { span, stmts }
  }
  function parse_stmt(): Stmt {
    switch (current_kind()) {
      default:
        throw new Error(`Unexpected token: ${current_kind()}`)
    }
  }

  function at(token_kind: TokenKind): boolean {
    return current_token.kind === token_kind
  }
  function current_kind(): TokenKind {
    return current_token.kind
  }

  function advance(): void {
    current_token = lexer.next()
  }
}
