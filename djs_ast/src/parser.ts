import assert from "node:assert/strict"
import {
  AccessorType,
  ArrayLiteralMember,
  ArrowFnBody,
  AssignOp,
  BinOp,
  Block,
  DeclType,
  Expr,
  Ident,
  MethodDef,
  ObjectKey,
  ObjectLiteralEntry,
  ObjectPatternProperty,
  Param,
  ParamList,
  ParseError,
  Pattern,
  SourceFile,
  Stmt,
  VarDecl,
  VarDeclarator,
  type Func,
} from "./ast.gen.js"
import { Lexer } from "./lexer.js"
import { Span } from "./Span.js"
import { Token } from "./Token.js"
import { TokenKind } from "./TokenKind.js"
import { todo } from "./assert.js"
import { preview_lines } from "./diagnostic.js"

interface Parser {
  parse_source_file(): SourceFile
}
export function Parser(source: string): Parser {
  return parser_impl(source)
}
const ERR = Symbol("ParseError")
type Err = typeof ERR

const t = TokenKind
function parser_impl(source: string): Parser {
  let lexer = Lexer(source)
  let last_token: Token | null = null
  let current_token = lexer.next()
  let errors: ParseError[] = []

  function fork(): <T>(value: T) => T {
    const snapshot = {
      lexer: lexer.clone(),
      last_token: last_token,
      current_token: current_token,
      errors: [...errors],
    }

    return function restore(value) {
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

  return { parse_source_file }

  function parse_ident(): Ident | Err {
    if (current_token.kind === t.Ident) {
      const tok = advance()
      return { span: tok.span, text: tok.text }
    } else {
      emit_error("Expected an identifier")
      return ERR
    }
  }
  function parse_expr(): Expr | Err {
    const first = parse_assignment_expr()
    if (first === ERR) return first
    const comma_exprs: Expr[] = [first]

    while (current_token.kind === t.Comma) {
      advance()
      const expr = parse_assignment_expr()
      if (expr === ERR) return ERR
      comma_exprs.push(expr)
    }

    if (comma_exprs.length === 1) {
      return comma_exprs[0]
    } else {
      const start = comma_exprs[0].span
      const end = comma_exprs[comma_exprs.length - 1].span
      return Expr.Comma(Span.between(start, end), comma_exprs)
    }
  }

  function parse_exponentiation_expr(): Expr | Err {
    // TODO: Handle exponentiation operator
    return parse_unary_expr()
  }
  function parse_update_expr(): Expr | Err {
    switch (current_token.kind) {
      case t.PlusPlus: {
        const start = advance()
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.PreIncrement(Span.between(start.span, expr.span), expr)
      }
      case t.MinusMinus: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.PreDecrement(Span.between(start, expr.span), expr)
      }
      default: {
        const lhs = parse_left_hand_side_expr()
        if (lhs === ERR) return ERR
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
  function parse_member_or_call_expr(allow_calls: boolean): Expr | Err {
    let lhs: Expr

    if (current_token.kind === t.New) {
      const start = advance()
      // When parsing something like "new Foo()", we don't want to allow calls when parsing Foo
      // since new Foo() means `new (Foo)()` and not (new (Foo()))
      const expr = parse_member_or_call_expr(/* allow_calls */ false)
      if (expr === ERR) return expr
      lhs = Expr.New(Span.between(start.span, expr.span), expr)
    } else {
      const expr = parse_primary_expr()
      if (expr === ERR) return expr
      lhs = expr
    }

    while (true) {
      switch (current_token.kind) {
        case t.Dot: {
          advance()
          const prop = parse_member_ident_name()
          if (prop === ERR) return prop

          const span = Span.between(lhs.span, prop.span)
          lhs = Expr.Prop(span, lhs, prop)
          break
        }
        case t.LSquare: {
          const start = advance()
          const prop = parse_expr()
          if (prop === ERR) return prop
          const end = expect(t.RSquare)
          if (end === ERR) return end
          const span = Span.between(start.span, end.span)
          lhs = Expr.Index(span, lhs, prop)
          break
        }
        case t.LParen: {
          if (allow_calls) {
            const args = parse_arguments()
            if (args === ERR) return ERR
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

  function parse_left_hand_side_expr(): Expr | Err {
    return parse_member_or_call_expr(/* allow_calls */ true)
  }

  function parse_member_ident_name(): Ident | Err {
    if (TokenKind.is_keyword(current_token.kind)) {
      const token = advance()
      return { span: token.span, text: token.text }
    } else {
      return parse_ident()
    }
  }

  function parse_arguments(): Err | { args: Expr[]; span: Span } {
    const first = advance()
    assert(first.kind === t.LParen)
    const args = parse_arg_list()
    if (args === ERR) return ERR
    const last = expect(t.RParen)
    if (last === ERR) return ERR
    const span = Span.between(first.span, last.span)
    return { args, span }
  }

  function parse_arg_list(): Expr[] | Err {
    const args: Expr[] = []
    while (true) {
      if (
        current_token.kind === t.RParen ||
        current_token.kind === t.EndOfFile
      ) {
        break
      }

      // Parse each argument as an assignment expression instead of a comma expression
      const arg = parse_assignment_expr()
      if (arg === ERR) return ERR
      args.push(arg)

      if (current_token.kind === t.Comma) {
        advance()
      } else {
        break
      }
    }
    return args
  }

  function parse_unary_expr(): Expr | Err {
    switch (current_token.kind) {
      case t.Delete: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.Delete(Span.between(start, expr.span), expr)
      }
      case t.Bang: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.Not(Span.between(start, expr.span), expr)
      }
      case t.Plus: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.UnaryPlus(Span.between(start, expr.span), expr)
      }
      case t.Minus: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.UnaryMinus(Span.between(start, expr.span), expr)
      }
      case t.Typeof: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.TypeOf(Span.between(start, expr.span), expr)
      }
      case t.Void: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.Void(Span.between(start, expr.span), expr)
      }
      case t.Await: {
        const start = advance().span
        const expr = parse_unary_expr()
        if (expr === ERR) return ERR
        return Expr.Await(Span.between(start, expr.span), expr)
      }
      default:
        return parse_update_expr()
    }
  }

  function parse_primary_expr(): Expr | Err {
    switch (current_token.kind) {
      case t.Ident: {
        const ident = parse_ident()
        if (ident === ERR) return ERR
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
        if (entries === ERR) return ERR
        const end = expect(t.RBrace)
        if (end === ERR) return ERR
        return Expr.Object(Span.between(start.span, end.span), entries)
      }
      case t.LParen:
        return parse_paren_expr()
      case t.Async: {
        advance()
        if (at(t.Function)) {
          const f = parse_function()
          if (f === ERR) return ERR
          return Expr.Func(f.span, f)
        } else {
          return parse_arrow_fn()
        }
      }
      case t.Function: {
        const f = parse_function()
        if (f === ERR) return ERR
        return Expr.Func(f.span, f)
      }
      case t.Throw: {
        const start = advance().span
        const expr = parse_expr()
        if (expr === ERR) return ERR
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
        emit_error("Expected an expression")
        return ERR
    }
  }
  function parse_object_literal_entry(): ObjectLiteralEntry | Err {
    if (at(t.DotDotDot)) {
      advance()
      const expr = parse_assignment_expr()
      if (expr === ERR) return ERR
      return ObjectLiteralEntry.Spread(expr.span, expr)
    } else if (at(t.Ident) && (next_is(t.Comma) || next_is(t.RBrace))) {
      const ident = parse_ident()
      if (ident === ERR) return ERR
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
      if (name === ERR) return ERR

      switch (current_token.kind) {
        case t.LParen: {
          const params = parse_params_with_parens()
          if (params === ERR) return ERR

          const body = parse_block()
          if (body === ERR) return ERR
          const span = Span.between(start, body.span)
          const method: MethodDef = {
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
          if (expect(t.Colon) === ERR) return ERR
          const expr = parse_assignment_expr()
          if (expr === ERR) return ERR

          return ObjectLiteralEntry.Prop(
            Span.between(start, expr.span),
            name,
            expr,
          )
        }
      }
    }
  }
  function parse_object_literal_entry_method(): ObjectLiteralEntry | Err {
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
    if (name === ERR) return ERR
    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    const body = parse_block()
    if (body === ERR) return ERR
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

  function parse_object_key(): ObjectKey | Err {
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
        if (expr === ERR) return ERR
        if (expect(t.RSquare) === ERR) return ERR
        return ObjectKey.Computed(expr.span, expr)
      }
      default: {
        const name = parse_member_ident_name()
        if (name === ERR) return ERR
        return ObjectKey.Ident(name.span, name)
      }
    }
  }

  function parse_params_with_parens(): ParamList | Err {
    const start = expect(t.LParen)
    if (start === ERR) return ERR
    const params: Param[] = []

    while (!at(t.RParen) && !at(t.EndOfFile)) {
      if (params.length > 0) {
        if (expect(t.Comma) === ERR) return ERR
      }

      const pattern = parse_pattern()
      if (pattern === ERR) return ERR
      params.push({
        span: pattern.span,
        pattern,
      })

      if (at(t.Comma) && next_is(t.RParen)) {
        advance()
        break
      }
    }

    const stop = expect(t.RParen)
    if (stop === ERR) return ERR
    return {
      span: Span.between(start.span, stop.span),
      params,
    }
  }

  function parse_comma_separated_list<T>(
    end_token: TokenKind,
    parse_item: () => T | Err,
  ): T[] | Err {
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
          return ERR
        }
      } else {
        first = false
      }

      const entry = parse_item()
      if (entry === ERR) return ERR
      items.push(entry)

      if (at(t.Comma) && next_is(end_token)) {
        advance()
        break
      }
    }

    return items
  }
  function parse_paren_expr(): Expr | Err {
    const start = advance()
    assert(start.kind === t.LParen)
    const expr = parse_expr()
    if (expect(t.RParen) === ERR) return ERR
    return expr
  }

  function next_is(token_kind: TokenKind): boolean {
    return lexer.clone().next().kind === token_kind
  }
  function next_token(): Token {
    return lexer.clone().next()
  }

  function parse_assignment_expr(): Expr | Err {
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
        if (expr === ERR) return ERR
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
      if (pattern === ERR) return ERR
      const params = {
        span: pattern.span,
        params: [{ span: pattern.span, pattern }],
      }
      if (expect(t.FatArrow) === ERR) return ERR
      const body = parse_arrow_fn_body()
      if (body === ERR) return ERR
      return Expr.ArrowFn(Span.between(params.span, body.span), params, body)
    } else if (at(t.LParen) && can_start_arrow_fn()) {
      return parse_arrow_fn()
    } else {
      const lhs = parse_conditional_expr()
      if (lhs === ERR) return ERR
      const assignOp = assign_op(current_token.kind)

      if (assignOp !== null) {
        const lhsPattern = expr_to_pattern(lhs)
        if (lhsPattern === null) {
          emit_error("Invalid left-hand side in assignment")
          return ERR
        }

        advance()
        const rhs = parse_assignment_expr()
        if (rhs === ERR) return ERR
        const span = Span.between(lhsPattern.span, rhs.span)
        return Expr.Assign(span, lhsPattern, assignOp, rhs)
      } else {
        return lhs
      }
    }
  }

  function parse_arrow_fn(): Expr | Err {
    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    if (expect(t.FatArrow) === ERR) return ERR
    const body = parse_arrow_fn_body()
    if (body === ERR) return ERR

    return Expr.ArrowFn(Span.between(params.span, body.span), params, body)
  }

  function parse_pattern(): Pattern | Err {
    return parse_pattern_with_precedence(PatternFlags.all())
  }

  function parse_pattern_with_precedence(flags: number): Pattern | Err {
    let head: Pattern

    switch (current_token.kind) {
      case t.Ident: {
        const ident = parse_binding_ident()
        if (ident === ERR) return ERR
        head = Pattern.Var(ident.span, ident)
        break
      }
      case t.DotDotDot: {
        if ((flags & PatternFlags.ALLOW_SPREAD) !== 0) {
          advance()
          const pattern = parse_pattern_with_precedence(
            ~(PatternFlags.ALLOW_ASSIGNMENT | PatternFlags.ALLOW_SPREAD),
          )
          if (pattern === ERR) return ERR
          head = Pattern.Rest(pattern.span, pattern)
          break
        } else {
          emit_error("Unexpected rest pattern")
          return ERR
        }
      }
      case t.LSquare: {
        const start = advance()
        const elements: Pattern[] = []

        while (true) {
          if (
            (at(t.Comma) && next_is(t.RSquare) && elements.length > 0) ||
            at(t.RSquare) ||
            at(t.EndOfFile)
          ) {
            if (at(t.Comma)) {
              advance()
            }
            break
          } else if (at(t.Comma)) {
            const span = advance().span
            elements.push(Pattern.Elision(span))
          } else {
            const p = parse_pattern()
            if (p === ERR) return ERR
            elements.push(p)
            if (at(t.RSquare)) {
              break
            }
            if (expect(t.Comma) === ERR) return ERR
          }
        }

        const end = expect(t.RSquare)
        if (end === ERR) return ERR
        head = Pattern.Array(Span.between(start.span, end.span), elements)
        break
      }
      case t.LBrace: {
        const start = advance()
        const properties: ObjectPatternProperty[] = []
        let rest: Pattern | null = null

        while (true) {
          if (at(t.RBrace) || at(t.EndOfFile)) {
            break
          } else if (at(t.DotDotDot)) {
            advance()
            const rest_pattern = parse_pattern()
            if (rest_pattern === ERR) return ERR
            rest = rest_pattern

            if (at(t.Comma)) {
              advance()
            }
            break
          } else {
            const property = parse_object_pattern_property()
            if (property === ERR) return ERR
            properties.push(property)

            if (at(t.RBrace)) {
              break
            }
            if (expect(t.Comma) === ERR) return ERR
          }
        }

        const stop = expect(t.RBrace)
        if (stop === ERR) return ERR
        head = Pattern.Object(
          Span.between(start.span, stop.span),
          properties,
          rest,
        )
        break
      }
      default:
        emit_error(`Expected a pattern, got ${current_token.kind}`)
        return ERR
    }

    if (at(t.Eq) && (flags & PatternFlags.ALLOW_ASSIGNMENT) !== 0) {
      advance()
      const init = parse_assignment_expr()
      if (init === ERR) return ERR
      return Pattern.Assignment(Span.between(head.span, init.span), head, init)
    }

    return head
  }

  function parse_binding_ident(): Ident | Err {
    // TODO: Handle [Yield, Await] as identifier names
    return parse_ident()
  }

  function parse_object_pattern_property(): ObjectPatternProperty | Err {
    const key = parse_object_key()
    if (key === ERR) return ERR
    let value: Pattern

    if (current_token.kind === t.Colon) {
      advance()
      const pattern = parse_pattern()
      if (pattern === ERR) return ERR
      value = pattern
    } else if (key.kind === "Ident") {
      value = Pattern.Var(key.span, {
        span: key.span,
        text: key.ident.text,
      })
    } else {
      if (expect(t.Colon) === ERR) return ERR
      const p = parse_pattern()
      if (p === ERR) return ERR
      value = p
    }

    return {
      span: Span.between(key.span, value.span),
      key,
      value,
    }
  }
  function is_accessor_type(token: Token): boolean {
    // In the original Rust implementation, this is defined as a method on Token
    // The implementation checks if the token is either 'get' or 'set'
    return (
      token.kind === t.Ident && (token.text === "get" || token.text === "set")
    )
  }

  function parse_short_circuit_expr(): Expr | Err {
    // TODO: parse_coalesce_expr
    return parse_logical_or_expr()
  }
  function parse_conditional_expr(): Expr | Err {
    const lhs = parse_short_circuit_expr()
    if (lhs === ERR) return ERR

    switch (current_token.kind) {
      case t.Question: {
        advance()
        const consequent = parse_expr()
        if (consequent === ERR) return ERR
        if (expect(t.Colon) === ERR) return ERR
        const alternate = parse_assignment_expr()
        if (alternate === ERR) return ERR
        const span = Span.between(lhs.span, alternate.span)
        return Expr.Ternary(span, lhs, consequent, alternate)
      }
      default:
        return lhs
    }
  }
  function parse_arrow_fn_body(): ArrowFnBody | Err {
    switch (current_token.kind) {
      case t.LBrace: {
        const block = parse_block()
        if (block === ERR) return ERR

        return ArrowFnBody.Block(block.span, block)
      }
      default: {
        const e = parse_expr()
        if (e === ERR) return ERR
        return ArrowFnBody.Expr(e.span, e)
      }
    }
  }
  function parse_block(): Block | Err {
    const start = expect(t.LBrace)
    if (start === ERR) return ERR
    const stmts = parse_stmt_list((token_kind) => token_kind === t.RBrace)
    const stop = expect(t.RBrace)
    if (stop === ERR) return ERR
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
      if (stmt === ERR) {
        recover_till_next_stmt()
        continue
      }
      stmts.push(stmt)
    }
    return stmts
  }

  function parse_array_literal(): Expr | Err {
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
        if (expr === ERR) return ERR
        elements.push(
          ArrayLiteralMember.Spread(Span.between(start, expr), expr),
        )
        if (at(t.RSquare)) break
        if (expect(t.Comma) === ERR) return ERR
      } else if (current_token.kind === t.Comma) {
        const span = advance().span
        elements.push(ArrayLiteralMember.Elision(span))
      } else {
        const e = parse_assignment_expr()
        if (e === ERR) return ERR
        elements.push(ArrayLiteralMember.Expr(e.span, e))
        if (at(t.RSquare)) break
        if (expect(t.Comma) === ERR) return ERR
      }
    }
    const end = expect(t.RSquare)
    if (end === ERR) return ERR
    return Expr.Array(Span.between(start.span, end.span), elements)
  }

  function expect(token_kind: TokenKind): Token | Err {
    if (current_token.kind === token_kind) {
      return advance()
    } else {
      emit_error(`Expected ${token_kind}, got ${current_token.kind}`)
      return ERR
    }
  }
  function parse_stmt(): Stmt | Err {
    switch (current_token.kind) {
      case t.Let:
      case t.Const:
      case t.Var: {
        const decl = parse_var_decl()
        if (decl === ERR) return ERR
        return Stmt.VarDecl(decl.span, decl)
      }
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
      case t.LBrace: {
        const block = parse_block()
        if (block === ERR) return ERR
        return Stmt.Block(block.span, block)
      }
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
        if (expect(t.LParen) === ERR) return ERR
        const obj = parse_expr()
        if (obj === ERR) return ERR
        if (expect(t.RParen) === ERR) return ERR
        const body = parse_stmt()
        if (body === ERR) return ERR
        return Stmt.With(Span.between(start.span, body.span), obj, body)
      }
      case t.Function: {
        const f = parse_function()
        if (f === ERR) return ERR
        return Stmt.Func(f.span, f)
      }
      // case t.Class: {
      //   const c = parse_class()
      //   return Stmt.ClassDecl(c)
      // }
      case t.Async: {
        if (next_is(t.Function)) {
          advance()
          const f = parse_function()
          if (f === ERR) return ERR
          return Stmt.Func(f.span, f)
        } else {
          emit_error(`Expected 'function'`)
          return ERR
        }
      }
      default:
        return parse_expr_stmt()
    }
  }

  function parse_function(): Func | Err {
    const start = advance()

    const is_generator = at(t.Star)
    if (is_generator) {
      advance()
    }

    const name = at(t.Ident) ? parse_ident() : null
    if (name === ERR) return ERR

    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    const body = parse_block()
    if (body === ERR) return ERR

    const span = Span.between(start.span, body.span)

    return {
      span,
      name,
      params,
      body,
      is_generator,
      is_async: false,
    }
  }
  function parse_var_decl(): VarDecl | Err {
    let span = current_token.span

    let decl_type: DeclType
    switch (current_token.kind) {
      case t.Let:
        advance()
        decl_type = DeclType.Let
        break
      case t.Const:
        advance()
        decl_type = DeclType.Const
        break
      case t.Var:
        advance()
        decl_type = DeclType.Var
        break
      default:
        throw new Error(
          `Expected let, const, or var, got ${current_token.kind}`,
        )
    }

    const first = parse_var_declarator()
    if (first === ERR) return ERR
    const declarators: VarDeclarator[] = [first]

    while (at(t.Comma)) {
      advance()
      const item = parse_var_declarator()
      if (item === ERR) return ERR
      declarators.push(item)
    }

    // Update span to include all declarators
    if (declarators.length > 0) {
      const lastDeclarator = declarators[declarators.length - 1]
      span = Span.between(
        span,
        lastDeclarator.init?.span || lastDeclarator.pattern.span,
      )
    }

    expect_semi()

    return {
      span,
      decl_type,
      declarators,
    }
  }

  function parse_var_declarator(): VarDeclarator | Err {
    // Parse the pattern with restrictions - no assignment or spread allowed
    const pattern = parse_pattern_with_precedence(
      ~(PatternFlags.ALLOW_ASSIGNMENT | PatternFlags.ALLOW_SPREAD),
    )
    if (pattern === ERR) return ERR

    let init: Expr | null = null
    if (current_token.kind === t.Eq) {
      advance()
      const expr = parse_assignment_expr()
      if (expr === ERR) return ERR
      init = expr
    }

    return { pattern, init }
  }

  function can_start_arrow_fn(): boolean {
    assert(
      current_token.kind === t.LParen,
      `Expected can_start_arrow_fn to be called when current token is a (, found ${current_token.kind}`,
    )
    const restore = fork()
    if (!expect(t.LParen)) return restore(false)
    const params = parse_comma_separated_list(t.RParen, parse_pattern)
    if (params === ERR) return restore(false)
    const rparen = expect(t.RParen)
    if (rparen === ERR) return restore(false)
    const fatarrow = expect(t.FatArrow)
    if (fatarrow === ERR) return restore(false)

    return restore(fatarrow.line === rparen.line)
  }

  function emit_error(message: string): void {
    errors.push({
      message,
      span: current_token.span,
    })
  }

  function parse_if_stmt(): Stmt | Err {
    assert(at(t.If))
    const start = advance().span
    if (expect(t.LParen) === ERR) return ERR

    const cond = parse_expr()
    if (cond === ERR) return ERR
    if (expect(t.RParen) === ERR) return ERR

    const then_branch = parse_stmt()
    if (then_branch === ERR) return ERR

    const else_branch = at(t.Else) ? (advance(), parse_stmt()) : null
    if (else_branch === ERR) return ERR

    return Stmt.If(
      Span.between(start, else_branch ? else_branch.span : then_branch.span),
      cond,
      then_branch,
      else_branch,
    )
  }
  function parse_expr_stmt(): Extract<Stmt, { kind: "Expr" }> | Err {
    const expr = parse_expr()
    if (expr === ERR) return ERR
    if (expect_semi() === ERR) return ERR
    return Stmt.Expr(expr.span, expr)
  }
  function expect_semi(): Err | void {
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
    return ERR
  }

  function parse_source_file(): SourceFile {
    const stmts: Stmt[] = []
    const span = current_token.span
    while (!at(t.EndOfFile)) {
      const stmt = parse_stmt()
      if (stmt === ERR) {
        recover_till_next_stmt()
        continue
      }
      stmts.push(stmt)
    }
    return { span, stmts, errors }
  }
  function recover_till_next_stmt(): void {
    if (at(t.EndOfFile)) return
    do {
      advance()
    } while (!at(t.EndOfFile) && !at(t.Semi) && !at(t.RBrace) && !at(t.LBrace))
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
    if (current_token.kind === t.Error) {
      emit_error(current_token.text)
    }
    assert(current_token.span.start >= last_token.span.start)
    return last_token
  }

  function define_binop_parser(
    next_fn: () => Expr | Err,
    ...kinds: readonly TokenKind[]
  ) {
    return function () {
      let lhs = next_fn()
      if (lhs === ERR) return ERR
      const op_kinds = new Set(kinds)
      while (op_kinds.has(current_token.kind)) {
        const op = parse_bin_op(advance().kind)
        const rhs = next_fn()
        if (rhs === ERR) return ERR
        const span = Span.between(lhs.span, rhs.span)
        lhs = Expr.BinOp(span, lhs, op, rhs)
      }

      return lhs
    }
  }
}
const TOKEN_TO_BINOP: Partial<Record<TokenKind, BinOp>> = {
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

// Pattern flags bitmask values
const PatternFlags = {
  NONE: 0,
  ALLOW_ASSIGNMENT: 1 << 0,
  ALLOW_SPREAD: 1 << 1,

  all(): number {
    return this.ALLOW_ASSIGNMENT | this.ALLOW_SPREAD
  },
}
