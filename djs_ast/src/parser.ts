import assert from "node:assert"
import { ArrayLiteralMember, Expr, Ident, SourceFile, Stmt } from "./ast.gen.js"
import { Lexer } from "./lexer.js"
import { Span } from "./Span.js"
import { Token } from "./Token.js"
import { TokenKind } from "./TokenKind.js"

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
  let last_token: Token | null = null
  let current_token = lexer.next()
  return { parse_source_file, parse_expr }

  function parse_expr(): Expr {
    return parse_primary_expr()
  }
  function parse_ident(): Ident {
    if (current_token.kind === t.Ident) {
      const tok = advance()
      return { span: tok.span, text: tok.text }
    } else {
      throw new Error(`Expected identifier, got ${current_token.kind}`)
    }
  }

  function parse_primary_expr(): Expr {
    switch (current_token.kind) {
      case t.Ident: {
        const ident = parse_ident()
        return Expr.Var(ident.span, ident)
      }
      case t.True:
        advance()
        return Expr.Boolean(last_token!.span, true)
      case t.False:
        return Expr.Boolean(advance().span, false)
      case t.Null:
        advance()
        return Expr.Null(last_token!.span)
      case t.Undefined:
        return Expr.Undefined(advance().span)
      case t.String: {
        const tok = advance()
        return Expr.String(tok.span, tok.text)
      }
      case t.Number: {
        const tok = advance()
        return Expr.Number(tok.span, tok.text)
      }
      // case t.LBrace: {
      //   const start = advance()
      //   const entries = parse_comma_separated_list(
      //     t.RBrace,
      //     parse_object_literal_entry,
      //   )
      //   const end = expect(t.RBrace)
      //   return Expr.Object(Span.between(start.span, end.span), entries)
      // }
      case t.LParen:
        return parse_paren_expr()
      // case t.Async: {
      //   advance()
      //   if (at(t.Function)) {
      //     const f = parse_function()
      //     return Expr.Func(f.span, f)
      //   } else {
      //     return parse_arrow_fn()
      //   }
      // }
      // case t.Function: {
      //   const f = parse_function()
      //   return Expr.Func(f.span, f)
      // }
      case t.Throw: {
        const start = advance().span
        const expr = parse_expr()
        return Expr.Throw(Span.between(start, expr.span), expr)
      }
      case t.LSquare:
        parse_array_literal()
      // case t.Slash: {
      //   re_lex_regex()
      //   const tok = expect(t.Regex)
      //   return Expr.Regex(tok.span, tok.text)
      // }
      case t.Super:
        return Expr.Super(advance().span)
      // case t.Class: {
      //   const cls = parse_class()
      //   return Expr.Class(cls)
      // }
      // case t.TemplateLiteralFragment:
      //   return parse_template_literal()
      default:
        throw new Error("Couldn't parse primary expression")
    }
  }
  function parse_paren_expr(): Expr {
    expect(t.LParen)
    const expr = parse_expr()
    expect(t.RParen)
    return expr
  }

  function next_is(token_kind: TokenKind): boolean {
    return lexer.clone().next().kind === token_kind
  }

  function parse_assignment_expr(): Expr {
    throw new Error("Not implemented")
  }

  function parse_array_literal(): Expr {
    const start = advance()
    const elements: Array<ArrayLiteralMember> = []
    while (true) {
      if (
        (current_token.kind === t.Comma &&
          next_is(t.RSquare) &&
          elements.length > 0) ||
        current_token.kind === t.RSquare ||
        current_token.kind === t.EndOfFile
      ) {
        if (current_token.kind === t.Comma) advance()
        break
      } else if (current_token.kind === t.DotDotDot) {
        const start = advance()
        const expr = parse_assignment_expr()
        elements.push(
          ArrayLiteralMember.Spread(Span.between(start, expr), expr),
        )
        if (at(t.RSquare)) break
        expect(t.Comma)
      } else if (current_token.kind === t.Comma) {
        const span = advance().span
        elements.push(ArrayLiteralMember.Elision(span))
      } else {
        const e = parse_assignment_expr()
        elements.push(ArrayLiteralMember.Expr(e.span, e))
        if (at(t.RSquare)) break
        expect(t.Comma)
      }
    }
    const end = expect(t.RSquare)
    return Expr.Array(Span.between(start.span, end.span), elements)
  }

  function expect(token_kind: TokenKind): Token {
    if (current_token.kind === token_kind) {
      return advance()
    } else {
      throw new Error(
        `Expected ${token_kind}, got ${current_token.kind} at ${current_token.span.start}`,
      )
    }
  }
  function parse_stmt(): Stmt {
    switch (current_token.kind) {
      // case t.Let:
      // case t.Const:
      // case t.Var: {
      //   const decl = parse_var_decl()
      //   return Stmt.VarDecl(decl)
      // }
      // case t.If:
      //   return parse_if_stmt()
      // case t.Switch:
      //   return parse_switch_stmt()
      // case t.While:
      //   return parse_while_stmt()
      // case t.Do:
      //   return parse_do_while_stmt()
      // case t.Try:
      //   return parse_try_stmt()
      // case t.Return:
      //   return parse_return_stmt()
      case t.Semi: {
        const tok = advance()
        return Stmt.Empty(tok.span)
      }
      // case t.LBrace:
      //   return Stmt.Block(parse_block())
      // case t.For: {
      //   let for_stmt_snapshot = clone()
      //   try {
      //     const stmt = for_stmt_snapshot.parse_for_stmt()
      //     commit(for_stmt_snapshot)
      //     return stmt
      //   } catch {
      //     return parse_for_in_of_stmt()
      //   }
      // }
      case t.Break: {
        const span = advance().span
        expect_semi()
        return Stmt.Break(span, null)
      }
      case t.Continue: {
        const span = advance().span
        expect_semi()
        return Stmt.Continue(span, null)
      }
      case t.Debugger: {
        const span = advance().span
        expect_semi()
        return Stmt.Debugger(span)
      }
      case t.With: {
        const start = advance()
        expect(t.LParen)
        const obj = parse_expr()
        expect(t.RParen)
        const body = parse_stmt()
        return Stmt.With(Span.between(start.span, body.span), obj, body)
      }
      // case t.Function: {
      //   const f = parse_function()
      //   return Stmt.FunctionDecl(f)
      // }
      // case t.Class: {
      //   const c = parse_class()
      //   return Stmt.ClassDecl(c)
      // }
      // case t.Async: {
      //   if (next_is(t.Function)) {
      //     advance()
      //     const f = parse_function()
      //     return Stmt.FunctionDecl(f)
      //   } else {
      //     return unexpected_token()
      //   }
      // }
      default:
        return parse_expr_stmt()
    }
  }
  function parse_expr_stmt(): Stmt {
    const expr = parse_expr()
    expect_semi()
    return Stmt.Expr(expr.span, expr)
  }
  function expect_semi(): void {
    if (current_kind() === t.Semi) {
      advance()
      return
    }
    if (at(t.RBrace) || at(t.EndOfFile)) {
      return
    }
    if (current_token.line !== last_token?.line) {
      return
    }
    assert(false, "Missing semicolon")
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

  function at(token_kind: TokenKind): boolean {
    return current_token.kind === token_kind
  }
  function current_kind(): TokenKind {
    return current_token.kind
  }

  function advance(): Token {
    last_token = current_token
    current_token = lexer.next()
    return last_token
  }
}
