import assert, { AssertionError } from "node:assert"
import {
  AccessorType,
  ArrayLiteralMember,
  ArrowFnBody,
  AssignOp,
  BinOp,
  Block,
  Expr,
  Ident,
  ObjectKey,
  ObjectLiteralEntry,
  ObjectPatternProperty,
  Param,
  ParamList,
  ParseError,
  Pattern,
  SourceFile,
  Stmt,
} from "./ast.gen.js"
import { Lexer } from "./lexer.js"
import { Span } from "./Span.js"
import { Token } from "./Token.js"
import { TokenKind } from "./TokenKind.js"
import { error } from "node:console"
import { preview_lines } from "./diagnostic.js"

interface Parser {
  parse_source_file(): SourceFile
  parse_expr(): Expr
}
export function Parser(source: string): Parser {
  return parser_impl(source, Lexer(source))
}

const t = TokenKind
function parser_impl(source: string, _lexer: Lexer): Parser {
  let lexer = _lexer
  let last_token: Token | null = null
  let current_token = lexer.next()
  let errors: ParseError[] = []
  let is_forked = false

  function fork(): <T>(value: T) => T {
    assert(!is_forked)
    const snapshot = {
      lexer: _lexer.clone(),
      last_token: last_token,
      current_token: current_token,
      errors: [...errors],
    }
    is_forked = true

    return function restore(value) {
      is_forked = false
      lexer = snapshot.lexer
      last_token = snapshot.last_token
      current_token = snapshot.current_token
      errors = snapshot.errors
      return value
    }
  }

  const parse_multiplicative_expr = define_binop_parser(
    parse_exponentiation_expr,
    t.Star,
    t.Slash,
    t.Percent,
  )

  const parse_additive_expr = define_binop_parser(
    parse_multiplicative_expr,
    t.Plus,
    t.Minus,
  )

  const parse_shift_expr = define_binop_parser(
    parse_additive_expr,
    t.LessThanLessThan,
    t.GreaterThanGreaterThan,
    t.GreaterThanGreaterThanGreaterThan,
  )

  const parse_relational_expr = define_binop_parser(
    parse_shift_expr,
    t.LessThan,
    t.GreaterThan,
    t.LessThanEq,
    t.GreaterThanEq,
    t.In,
    t.Instanceof,
  )

  const parse_equality_expr = define_binop_parser(
    parse_relational_expr,
    t.EqEq,
    t.EqEqEq,
    t.BangEq,
    t.BangEqEq,
    t.In,
    t.Instanceof,
  )

  const parse_bitwise_and_expr = define_binop_parser(parse_equality_expr, t.Amp)

  const parse_bitwise_xor_expr = define_binop_parser(
    parse_bitwise_and_expr,
    t.Caret,
  )

  const parse_bitwise_or_expr = define_binop_parser(
    parse_bitwise_xor_expr,
    t.VBar,
  )

  const parse_logical_and_expr = define_binop_parser(
    parse_bitwise_or_expr,
    t.VBarVBar,
  )

  const parse_logical_or_expr = define_binop_parser(
    parse_logical_and_expr,
    t.AmpAmp,
  )

  return { parse_source_file, parse_expr }

  function parse_ident(): Ident {
    if (current_token.kind === t.Ident) {
      const tok = advance()
      return { span: tok.span, text: tok.text }
    } else {
      throw new Error(`Expected identifier, got ${current_token.kind}`)
    }
  }
  function parse_expr(): Expr {
    const comma_exprs: Expr[] = [parse_assignment_expr()]

    while (current_token.kind === t.Comma) {
      advance()
      comma_exprs.push(parse_assignment_expr())
    }

    if (comma_exprs.length === 1) {
      return comma_exprs[0]
    } else {
      const start = comma_exprs[0].span
      const end = comma_exprs[comma_exprs.length - 1].span
      return Expr.Comma(Span.between(start, end), comma_exprs)
    }
  }

  function parse_exponentiation_expr(): Expr {
    // TODO: Handle exponentiation operator
    return parse_unary_expr()
  }
  function parse_update_expr(): Expr {
    switch (current_token.kind) {
      case t.PlusPlus: {
        const start = advance()
        const expr = parse_unary_expr()
        return Expr.PreIncrement(Span.between(start.span, expr.span), expr)
      }
      case t.MinusMinus: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.PreDecrement(Span.between(start, expr.span), expr)
      }
      default: {
        const lhs = parse_left_hand_side_expr()
        if (at(t.PlusPlus) && !current_is_on_new_line()) {
          const end = advance()
          return Expr.PostIncrement(Span.between(lhs.span, end.span), lhs)
        } else if (at(t.MinusMinus) && !current_is_on_new_line()) {
          const end = advance()
          return Expr.PostDecrement(Span.between(lhs.span, end.span), lhs)
        } else {
          return lhs
        }
      }
    }
  }
  function current_is_on_new_line(): boolean {
    if (last_token === null) {
      return false
    }
    return current_token.line > last_token.line
  }
  function parse_member_or_call_expr(allow_calls: boolean): Expr {
    let lhs: Expr

    if (current_token.kind === t.New) {
      const start = advance()
      // When parsing something like "new Foo()", we don't want to allow calls when parsing Foo
      // since new Foo() means `new (Foo)()` and not (new (Foo()))
      const expr = parse_member_or_call_expr(/* allow_calls */ false)
      lhs = Expr.New(Span.between(start.span, expr.span), expr)
    } else {
      lhs = parse_primary_expr()
    }

    while (true) {
      switch (current_token.kind) {
        case t.Dot: {
          advance()
          const prop = parse_member_ident_name()
          const span = Span.between(lhs.span, prop.span)
          lhs = Expr.Prop(span, lhs, prop)
          break
        }
        case t.LSquare: {
          const start = advance()
          const prop = parse_expr()
          const end = expect_or_throw(t.RSquare)
          const span = Span.between(start.span, end.span)
          lhs = Expr.Index(span, lhs, prop)
          break
        }
        case t.LParen: {
          if (allow_calls) {
            const args = parse_arguments()
            const span = Span.between(lhs.span, args.span)
            lhs = Expr.Call(span, lhs, args.args)
            break
          } else {
            return lhs
          }
        }
        default:
          return lhs
      }
    }
  }

  function parse_left_hand_side_expr(): Expr {
    return parse_member_or_call_expr(/* allow_calls */ true)
  }

  function parse_member_ident_name(): Ident {
    if (TokenKind.is_keyword(current_token.kind)) {
      const token = advance()
      return { span: token.span, text: token.text }
    } else {
      return parse_ident()
    }
  }

  function parse_arguments(): { args: Expr[]; span: Span } {
    const first = advance()
    assert(first.kind === t.LParen)
    const args = parse_arg_list()
    const last = expect_or_throw(t.RParen)
    const span = Span.between(first.span, last.span)
    return { args, span }
  }

  function parse_arg_list(): Expr[] {
    const args: Expr[] = []
    while (true) {
      if (
        current_token.kind === t.RParen ||
        current_token.kind === t.EndOfFile
      ) {
        break
      }

      // Parse each argument as an assignment expression instead of a comma expression
      args.push(parse_assignment_expr())

      if (current_token.kind === t.Comma) {
        advance()
      } else {
        break
      }
    }
    return args
  }

  function parse_unary_expr(): Expr {
    switch (current_token.kind) {
      case t.Delete: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.Delete(Span.between(start, expr.span), expr)
      }
      case t.Bang: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.Not(Span.between(start, expr.span), expr)
      }
      case t.Plus: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.UnaryPlus(Span.between(start, expr.span), expr)
      }
      case t.Minus: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.UnaryMinus(Span.between(start, expr.span), expr)
      }
      case t.Typeof: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.TypeOf(Span.between(start, expr.span), expr)
      }
      case t.Void: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.Void(Span.between(start, expr.span), expr)
      }
      case t.Await: {
        const start = advance().span
        const expr = parse_unary_expr()
        return Expr.Await(Span.between(start, expr.span), expr)
      }
      default:
        return parse_update_expr()
    }
  }

  function parse_primary_expr(): Expr {
    switch (current_token.kind) {
      case t.Ident: {
        const ident = parse_ident()
        return Expr.Var(ident.span, ident)
      }
      case t.True:
        return Expr.Boolean(advance().span, true)
      case t.False:
        return Expr.Boolean(advance().span, false)
      case t.Null:
        return Expr.Null(advance().span)
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
      case t.LBrace: {
        const start = advance()
        const entries = parse_comma_separated_list(
          t.RBrace,
          parse_object_literal_entry,
        )
        const end = expect_or_error(t.RBrace, "Expected a closing }")
        return Expr.Object(Span.between(start.span, end.span), entries)
      }
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
        return parse_array_literal()
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
        do {
          advance()
        } while (!at(t.EndOfFile) && current_token.line === last_token?.line)
        emit_error("Expected an expression")
        return Expr.ParseError(current_token.span)
    }
  }
  function parse_object_literal_entry(): ObjectLiteralEntry {
    if (at(t.DotDotDot)) {
      advance()
      const expr = parse_assignment_expr()
      return ObjectLiteralEntry.Spread(expr.span, expr)
    } else if (at(t.Ident) && (next_is(t.Comma) || next_is(t.RBrace))) {
      const ident = parse_ident()
      return ObjectLiteralEntry.Ident(ident.span, ident)
    } else if (
      at(t.Ident) &&
      current_matches(is_accessor_type) &&
      next_matches(Token.can_start_object_property_name)
    ) {
      return parse_object_literal_entry_method()
    } else if (at(t.Async) && next_is(t.Star)) {
      return parse_object_literal_entry_method()
    } else if (at(t.Async) && next_is(t.Ident)) {
      return parse_object_literal_entry_method()
    } else if (at(t.Async) && next_is(t.LSquare)) {
      return parse_object_literal_entry_method()
    } else if (at(t.Async) && next_token_is_keyword()) {
      return parse_object_literal_entry_method()
    } else if (at(t.Star)) {
      return parse_object_literal_entry_method()
    } else if (at(t.Ident) && next_is(t.LParen)) {
      return parse_object_literal_entry_method()
    } else {
      const start = current_token.span
      const name = parse_object_key()

      switch (current_token.kind) {
        case t.LParen: {
          const params = parse_params_with_parens()
          const body = parse_block()
          const span = Span.between(start, body.span)
          const method = {
            span,
            name,
            accessor_type: null,
            body: {
              span,
              name: null,
              params,
              body,
              is_generator: false,
              is_async: false,
            },
          }
          return ObjectLiteralEntry.Method(method.span, method)
        }
        default: {
          expect_or_throw(t.Colon)
          const expr = parse_assignment_expr()
          return ObjectLiteralEntry.Prop(
            Span.between(start, expr.span),
            name,
            expr,
          )
        }
      }
    }
  }
  function parse_object_literal_entry_method(): ObjectLiteralEntry {
    const start = current_token.span
    const line = current_token.line
    let accessor_type: AccessorType | null = null

    if (
      current_matches(is_accessor_type) &&
      next_matches(Token.can_start_object_property_name)
    ) {
      if (current_token.text === "get") {
        advance()
        accessor_type = AccessorType.Get
      } else if (current_token.text === "set") {
        advance()
        accessor_type = AccessorType.Set
      }
    }

    const is_async = at(t.Async)
    if (is_async) {
      advance()
    }

    const is_generator = at(t.Star)
    if (is_generator) {
      advance()
    }

    const name = parse_object_key()
    const params = parse_params_with_parens()
    const body = parse_block()
    const span = Span.between(start, body.span)

    if (accessor_type === AccessorType.Get && params.params.length > 0) {
      emit_error(`Getter method should not have any parameters`)
      // Could return an error node here, but continuing with processing
    }

    const method = {
      span,
      name,
      accessor_type,
      body: {
        span,
        name: null,
        params,
        body,
        is_generator,
        is_async,
      },
    }

    return ObjectLiteralEntry.Method(span, method)
  }
  function next_matches(predicate: (token: Token) => boolean): boolean {
    return predicate(next_token())
  }
  function next_token_is_keyword(): boolean {
    return TokenKind.is_keyword(next_token().kind)
  }
  function current_matches(predicate: (token: Token) => boolean): boolean {
    return predicate(current_token)
  }

  function parse_object_key(): ObjectKey {
    switch (current_token.kind) {
      case t.String: {
        const tok = advance()
        return ObjectKey.String(tok.span, tok.text)
      }
      case t.Number: {
        const tok = advance()
        return ObjectKey.String(tok.span, tok.text)
      }
      case t.LSquare: {
        advance()
        const expr = parse_expr()
        expect_or_throw(t.RSquare)
        return ObjectKey.Computed(expr.span, expr)
      }
      default: {
        const name = parse_member_ident_name()
        return ObjectKey.Ident(name.span, name)
      }
    }
  }

  function parse_params_with_parens(): ParamList {
    const start = expect_or_throw(t.LParen)
    const params: Param[] = []

    while (!at(t.RParen) && !at(t.EndOfFile)) {
      if (params.length > 0) {
        expect_or_throw(t.Comma)
      }

      const pattern = parse_pattern()
      params.push({
        span: pattern.span,
        pattern,
      })

      if (at(t.Comma) && next_is(t.RParen)) {
        advance()
        break
      }
    }

    const stop = expect_or_throw(t.RParen)
    return {
      span: Span.between(start.span, stop.span),
      params,
    }
  }

  function parse_comma_separated_list<T>(
    end_token: TokenKind,
    parse_item: () => T,
  ): T[] {
    const items: T[] = []
    let first = true

    while (
      current_token.kind !== t.EndOfFile &&
      current_token.kind !== end_token
    ) {
      if (!first) {
        if (at(t.Comma)) {
          advance()
        } else {
          emit_error(`Expected a comma or ${end_token}`)
        }
      } else {
        first = false
      }

      const entry = parse_item()
      items.push(entry)

      if (at(t.Comma) && next_is(end_token)) {
        advance()
        break
      }
    }

    return items
  }
  function parse_paren_expr(): Expr {
    const start = advance()
    assert(start.kind === t.LParen)
    const expr = parse_expr()
    expect_or_error(t.RParen, "Expected a closing )")
    return expr
  }

  function next_is(token_kind: TokenKind): boolean {
    return lexer.clone().next().kind === token_kind
  }
  function next_token(): Token {
    return lexer.clone().next()
  }

  function parse_assignment_expr(): Expr {
    if (at(t.Yield)) {
      const start = advance()
      if (current_is_on_new_line()) {
        return Expr.Yield(start.span, null)
      } else {
        let is_yield_from = false
        if (at(t.Star)) {
          advance()
          is_yield_from = true
        }
        const expr = parse_assignment_expr()
        const span = Span.between(start.span, expr.span)
        if (is_yield_from) {
          return Expr.YieldFrom(span, expr)
        } else {
          return Expr.Yield(span, expr)
        }
      }
    } else if (
      at(t.Ident) &&
      next_is(t.FatArrow) &&
      !current_is_on_new_line()
    ) {
      const pattern = parse_pattern()
      const params = {
        span: pattern.span,
        params: [{ span: pattern.span, pattern }],
      }
      expect_or_throw(t.FatArrow)
      const body = parse_arrow_fn_body()
      return Expr.ArrowFn(Span.between(params.span, body.span), params, body)
    } else if (at(t.LParen) && can_start_arrow_fn()) {
      return parse_arrow_fn()
    } else {
      const lhs = parse_conditional_expr()
      const assignOp = assign_op(current_token.kind)

      if (assignOp !== null) {
        const lhsPattern = expr_to_pattern(lhs)
        if (lhsPattern === null) {
          emit_error("Invalid left-hand side in assignment")
          return Expr.ParseError(current_token.span)
        }

        advance()
        const rhs = parse_assignment_expr()
        const span = Span.between(lhsPattern.span, rhs.span)
        return Expr.Assign(span, lhsPattern, assignOp, rhs)
      } else {
        return lhs
      }
    }
  }

  function parse_arrow_fn(): Expr {
    const params = parse_params_with_parens()
    expect_or_throw(t.FatArrow)
    const body = parse_arrow_fn_body()

    return Expr.ArrowFn(Span.between(params.span, body.span), params, body)
  }

  function parse_pattern(): Pattern {
    if (at(t.Ident)) {
      const ident = parse_ident()
      return Pattern.Var(ident.span, ident)
    } else {
      emit_error("Expected a pattern")
      advance()
      return Pattern.ParseError(current_token.span)
    }
  }
  function is_accessor_type(token: Token): boolean {
    // In the original Rust implementation, this is defined as a method on Token
    // The implementation checks if the token is either 'get' or 'set'
    return (
      token.kind === t.Ident && (token.text === "get" || token.text === "set")
    )
  }

  function parse_short_circuit_expr(): Expr {
    // TODO: parse_coalesce_expr
    return parse_logical_or_expr()
  }
  function parse_conditional_expr(): Expr {
    const lhs = parse_short_circuit_expr()

    switch (current_token.kind) {
      case t.Question: {
        advance()
        const consequent = parse_expr()
        expect_or_throw(t.Colon)
        const alternate = parse_assignment_expr()
        const span = Span.between(lhs.span, alternate.span)
        return Expr.Ternary(span, lhs, consequent, alternate)
      }
      default:
        return lhs
    }
  }
  function parse_arrow_fn_body(): ArrowFnBody {
    switch (current_token.kind) {
      case t.LBrace: {
        const start = advance()
        const stmts: Stmt[] = []

        while (!at(t.RBrace) && !at(t.EndOfFile)) {
          stmts.push(parse_stmt())
        }

        const stop = expect_or_throw(t.RBrace)
        const span = Span.between(start.span, stop.span)

        return ArrowFnBody.Block(span, {
          span,
          stmts,
        })
      }
      default: {
        const e = parse_expr()
        return ArrowFnBody.Expr(e.span, e)
      }
    }
  }
  function parse_block(): Block {
    const start = expect_or_throw(t.LBrace)
    const stmts = parse_stmt_list((token_kind) => token_kind === t.RBrace)
    const stop = expect_or_throw(t.RBrace)
    return {
      span: Span.between(start.span, stop.span),
      stmts,
    }
  }

  function parse_stmt_list(
    end_token: (token_kind: TokenKind) => boolean,
  ): Stmt[] {
    const stmts: Stmt[] = []
    while (
      !end_token(current_token.kind) &&
      current_token.kind !== t.EndOfFile
    ) {
      const stmt = parse_stmt()
      stmts.push(stmt)
    }
    return stmts
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
        expect_or_throw(t.Comma)
      } else if (current_token.kind === t.Comma) {
        const span = advance().span
        elements.push(ArrayLiteralMember.Elision(span))
      } else {
        const e = parse_assignment_expr()
        elements.push(ArrayLiteralMember.Expr(e.span, e))
        if (at(t.RSquare)) break
        expect_or_throw(t.Comma)
      }
    }
    const end = expect_or_throw(t.RSquare)
    return Expr.Array(Span.between(start.span, end.span), elements)
  }

  function expect_or_throw(token_kind: TokenKind): Token {
    if (current_token.kind === token_kind) {
      return advance()
    } else {
      console.log(preview_lines(source, current_token.span))
      throw new AssertionError({
        message: `Expected ${token_kind}, got ${current_token.kind} at ${current_token.span.start}`,
        stackStartFn: expect_or_throw,
      })
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
      case t.If:
        return parse_if_stmt()
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
        expect_or_error(t.LParen, "Expected a (")
        const obj = parse_expr()
        expect_or_error(t.RParen, "Expected a )")
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
        const expr_stmt = parse_expr_stmt()
        if (expr_stmt.expr.kind === "ParseError") {
          while (true) {
            if (at(t.EndOfFile)) break
            if (at(t.Semi)) break
            if (at(t.RBrace)) break
            advance()
          }
        }
        return expr_stmt
    }
  }

  function can_start_arrow_fn(): boolean {
    assert(
      current_token.kind === t.LParen,
      `Expected can_start_arrow_fn to be called when current token is a (, found ${current_token.kind}`,
    )
    const restore = fork()
    parse_comma_separated_list(t.RParen, parse_pattern)
    const rparen = advance()
    if (rparen.kind !== t.RParen) {
      return restore(false)
    }
    const fatarrow = advance()
    if (fatarrow.kind !== t.FatArrow) {
      return restore(false)
    }
    return restore(fatarrow.line === rparen.line)
  }

  function emit_error(message: string): void {
    errors.push({
      message,
      span: current_token.span,
    })
  }

  function expect_or_error(kind: TokenKind, message: string): Token {
    if (at(kind)) {
      return advance()
    } else {
      emit_error(message)
      return { ...current_token, kind: t.Error }
    }
  }

  function parse_if_stmt(): Stmt {
    const start = expect_or_throw(t.If).span
    expect_or_error(t.LParen, `Expected a '('`)

    const cond = parse_expr()
    expect_or_error(t.RParen, `Expected a ')'`)

    const then_branch = parse_stmt()
    const else_branch =
      current_token.kind === t.Else ? (advance(), parse_stmt()) : null

    return Stmt.If(
      Span.between(start, else_branch ? else_branch.span : then_branch.span),
      cond,
      then_branch,
      else_branch,
    )
  }
  function parse_expr_stmt(): Extract<Stmt, { kind: "Expr" }> {
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
    emit_error("Missing semicolon")
  }

  function parse_source_file(): SourceFile {
    const stmts: Stmt[] = []
    const span = current_token.span
    while (!at(t.EndOfFile)) {
      stmts.push(parse_stmt())
    }
    return { span, stmts, errors }
  }

  function at(token_kind: TokenKind): boolean {
    return current_token.kind === token_kind
  }
  function current_kind(): TokenKind {
    return current_token.kind
  }

  function advance(): Token {
    assert(current_token.kind !== t.EndOfFile, "Tried to advance past the EOF")
    last_token = current_token
    current_token = lexer.next()
    return last_token
  }

  function define_binop_parser(
    next_fn: () => Expr,
    ...kinds: readonly TokenKind[]
  ) {
    return function () {
      let lhs = next_fn()
      const op_kinds = new Set(kinds)
      while (op_kinds.has(current_token.kind)) {
        const op = parse_bin_op(advance().kind)
        const rhs = next_fn()
        const span = Span.between(lhs.span, rhs.span)
        lhs = Expr.BinOp(span, lhs, op, rhs)
      }

      return lhs
    }
  }
}
const TOKEN_TO_BINOP = {
  [t.EqEq]: BinOp.EqEq,
  [t.EqEqEq]: BinOp.EqEqEq,
  [t.BangEq]: BinOp.NotEq,
  [t.BangEqEq]: BinOp.NotEqEq,
  [t.LessThan]: BinOp.Lt,
  [t.LessThanEq]: BinOp.Lte,
  [t.GreaterThan]: BinOp.Gt,
  [t.GreaterThanEq]: BinOp.Gte,
  [t.Plus]: BinOp.Add,
  [t.Minus]: BinOp.Sub,
  [t.Star]: BinOp.Mul,
  [t.Slash]: BinOp.Div,
  [t.Percent]: BinOp.Mod,
  [t.In]: BinOp.In,
  [t.Instanceof]: BinOp.Instanceof,
  [t.AmpAmp]: BinOp.And,
  [t.VBarVBar]: BinOp.Or,
  [t.VBar]: BinOp.BitOr,
  [t.Caret]: BinOp.BitXor,
  [t.Amp]: BinOp.BitAnd,
  [t.LessThanLessThan]: BinOp.LeftShift,
  [t.GreaterThanGreaterThan]: BinOp.RightShift,
  [t.GreaterThanGreaterThanGreaterThan]: BinOp.UnsignedRightShift,
}
function parse_bin_op(kind: TokenKind): BinOp {
  const op = TOKEN_TO_BINOP[kind]
  assert(op !== undefined, `Unknown binop kind: ${kind}`)
  return op
}

function expr_to_pattern(expr: Expr): Pattern | null {
  switch (expr.kind) {
    case "Var":
      return Pattern.Var(expr.span, expr.ident)
    case "Object":
      return obj_literal_to_pattern(expr.span, expr.entries)
    case "Array":
      return array_literal_to_pattern(expr.span, expr.items)
    case "Prop":
      return Pattern.Prop(
        expr.span,
        expr.lhs,
        ObjectKey.Ident(expr.property.span, expr.property),
      )
    case "Index":
      return Pattern.Prop(
        expr.span,
        expr.lhs,
        ObjectKey.Computed(expr.property.span, expr.property),
      )
    default:
      return null
  }
}
function obj_literal_to_pattern(
  span: Span,
  entries: readonly ObjectLiteralEntry[],
): Pattern | null {
  const properties: ObjectPatternProperty[] = []
  let rest: Pattern | null = null

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]

    switch (entry.kind) {
      case "Ident": {
        properties.push({
          span: entry.ident.span,
          key: ObjectKey.Ident(entry.ident.span, entry.ident),
          value: Pattern.Var(entry.ident.span, entry.ident),
        })
        break
      }
      case "Prop": {
        const pattern = expr_to_pattern(entry.value)
        if (pattern === null) {
          return null
        }
        properties.push({
          span: entry.span,
          key: entry.key,
          value: pattern,
        })
        break
      }
      case "Spread": {
        if (index !== entries.length - 1) {
          return null
        }
        const pattern = expr_to_pattern(entry.expr)
        if (pattern === null) {
          return null
        }
        rest = pattern
        break
      }
      case "Method": {
        return null
      }
    }
  }

  return Pattern.Object(span, properties, rest)
}

function array_literal_to_pattern(
  span: Span,
  items: readonly ArrayLiteralMember[],
): Pattern | null {
  const members: Pattern[] = []

  for (const item of items) {
    switch (item.kind) {
      case "Elision": {
        members.push(Pattern.Elision(item.span))
        break
      }
      case "Expr": {
        const pattern = expr_to_pattern(item.expr)
        if (pattern === null) {
          return null
        }
        members.push(pattern)
        break
      }
      case "Spread": {
        const pattern = expr_to_pattern(item.expr)
        if (pattern === null) {
          return null
        }
        members.push(Pattern.Rest(pattern.span, pattern))
        break
      }
    }
  }

  return Pattern.Array(span, members)
}

function assign_op(kind: TokenKind): AssignOp | null {
  switch (kind) {
    case t.Eq:
      return AssignOp.Eq
    case t.PlusEq:
      return AssignOp.AddEq
    case t.MinusEq:
      return AssignOp.SubEq
    case t.StarEq:
      return AssignOp.MulEq
    case t.SlashEq:
      return AssignOp.DivEq
    case t.PercentEq:
      return AssignOp.ModEq
    case t.AmpEq:
      return AssignOp.BitAndEq
    case t.VBarEq:
      return AssignOp.BitOrEq
    case t.CaretEq:
      return AssignOp.BitXorEq
    case t.LessThanLessThanEq:
      return AssignOp.LeftShiftEq
    case t.GreaterThanGreaterThanEq:
      return AssignOp.RightShiftEq
    case t.GreaterThanGreaterThanGreaterThanEq:
      return AssignOp.UnsignedRightShiftEq
    case t.StarStarEq:
      return AssignOp.ExponentEq
    default:
      return null
  }
}
