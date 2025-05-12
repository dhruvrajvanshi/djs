import {
  AccessorType,
  ArrayLiteralMember,
  ArrowFnBody,
  AssignOp,
  BinOp,
  Block,
  Class,
  ClassMember,
  DeclType,
  Expr,
  ForInit,
  FuncTypeParam,
  Ident,
  ImportSpecifier,
  InOrOf,
  MethodDef,
  ModuleExportName,
  ObjectKey,
  ObjectLiteralEntry,
  ObjectPatternProperty,
  Param,
  ParamList,
  ParseError,
  Pattern,
  SourceFile,
  Stmt,
  StructTypeDeclField,
  SwitchCase,
  TemplateLiteralFragment,
  TypeAnnotation,
  TypeParam,
  VarDecl,
  VarDeclarator,
  type Func,
} from "./ast.gen.js"
import { Lexer } from "./lexer.js"
import { Span } from "./Span.js"
import { Token } from "./Token.js"
import { TokenKind } from "./TokenKind.js"
import assert, { AssertionError, throws } from "node:assert"

type Parser = {
  parse_source_file: () => SourceFile
}
export function Parser(path: string, source: string): Parser {
  let flags = 0
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    flags |= PARSER_FLAGS.ALLOW_TYPE_ANNOTATIONS
  }
  return parser_impl(path, source, flags)
}

type Err = "ParseError"
const ERR: Err = "ParseError"

const t = TokenKind

const PARSER_FLAGS = {
  ALLOW_TYPE_ANNOTATIONS: 1,
}

function parser_impl(path: string, source: string, flags: number): Parser {
  let lexer = Lexer(source)
  let previous_lexer: Lexer = lexer.clone()
  let last_token: Token | null = null
  let current_token = lexer.next()
  let errors: ParseError[] = []

  type ParserState = {
    previous_lexer: Lexer
    lexer: Lexer
    last_token: Token | null
    current_token: Token
    errors: ParseError[]
  }
  function create_snapshot(): ParserState {
    return {
      previous_lexer,
      lexer: lexer.clone(),
      last_token,
      current_token,
      errors: [...errors],
    }
  }
  function restore_snapshot(snapshot: ParserState) {
    lexer = snapshot.lexer
    last_token = snapshot.last_token
    current_token = snapshot.current_token
    errors = snapshot.errors
  }

  function fork(): <T>(value: T) => T {
    const snapshot = create_snapshot()

    return function restore(value) {
      restore_snapshot(snapshot)
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
    if (at(t.Ident)) {
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

    while (at(t.Comma)) {
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

    if (at(t.New)) {
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

  type ArgsWithSpan = { args: Expr[]; span: Span }
  function parse_arguments(): Err | ArgsWithSpan {
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
      if (at(t.RParen) || at(t.EndOfFile)) {
        break
      }

      // Parse each argument as an assignment expression instead of a comma expression
      const arg = parse_assignment_expr()
      if (arg === ERR) return ERR
      args.push(arg)

      if (at(t.Comma)) {
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
      case t.Slash: {
        re_lex_regex()
        if (!at(t.Regex) && !at(t.Error)) {
          throw new AssertionError({
            message:
              "Expected the current token to be a regex immediately after calling `re_lex_regex`",
            actual: current_token.kind,
            expected: [t.Regex, t.Error],
          })
        }
        const tok = expect(t.Regex)
        if (tok === ERR) return ERR
        return Expr.Regex(tok.span, tok.text)
      }
      case t.Super:
        return Expr.Super(advance().span)
      case t.Class: {
        const cls = parse_class()
        if (cls === ERR) return ERR
        return Expr.Class(cls.span, cls)
      }
      case t.TemplateLiteralFragment:
        return parse_template_literal()
      default:
        emit_error("Expected an expression")
        return ERR
    }
  }

  function re_lex_regex() {
    const l = previous_lexer.clone()
    l.enable_regex()
    current_token = l.next()
    l.disable_regex()
    lexer = l
  }
  function parse_template_literal(): Expr | Err {
    let span = current_token.span
    const fragments: TemplateLiteralFragment[] = []

    while (true) {
      if (at(t.TemplateLiteralFragment)) {
        const tok = advance()
        fragments.push(TemplateLiteralFragment.Text(tok.span, tok.text))

        if (tok.text.endsWith("${")) {
          lexer.start_template_literal_interpolation()
          const expr = parse_expr()
          if (expr === ERR) return ERR
          fragments.push(TemplateLiteralFragment.Expr(expr.span, expr))
          lexer.end_template_literal_interpolation()
        } else if (tok.text.endsWith("`")) {
          span = Span.between(span, tok.span)
          break
        }
      } else {
        emit_error("Unexpected end of template literal")
        return ERR
      }
    }

    return Expr.TemplateLiteral(span, fragments)
  }
  function parse_class(): Class | Err {
    const first = expect(t.Class)
    if (first === ERR) return ERR

    const name = parse_optional_binding_ident()
    if (name === ERR) return ERR

    let superclass: Expr | null = null
    if (at(t.Extends)) {
      advance()
      const expr = parse_left_hand_side_expr()
      if (expr === ERR) return ERR
      superclass = expr
    }

    const body_start = expect(t.LBrace)
    if (body_start === ERR) return ERR

    const members: ClassMember[] = []
    while (!at(t.RBrace) && !at(t.EndOfFile)) {
      const member = parse_class_member()
      if (member === ERR) return ERR
      members.push(member)
    }

    const body_end = expect(t.RBrace)
    if (body_end === ERR) return ERR

    const span = Span.between(first.span, body_end.span)

    return {
      span,
      name,
      superclass,
      body: {
        span: Span.between(body_start.span, body_end.span),
        members,
      },
    }
  }

  function parse_optional_binding_ident(): Ident | null | Err {
    if (at(t.Ident)) {
      return parse_binding_ident()
    } else {
      return null
    }
  }

  function parse_class_member(): ClassMember | Err {
    const method = parse_method_def()
    if (method === ERR) return ERR
    return ClassMember.MethodDef(method)
  }

  function parse_method_def(): MethodDef | Err {
    let static_token: Token | null = null
    if (at(t.Static)) {
      static_token = advance()
    }

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

    const start = static_token ? static_token.span : name.span

    const type_params = parse_optional_type_params()
    if (type_params === ERR) return ERR
    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    const return_type = parse_optional_type_annotation()
    if (return_type === ERR) return ERR

    const body = parse_block()
    if (body === ERR) return ERR

    const span = Span.between(start, body.span)

    return {
      span,
      name,
      accessor_type,
      return_type,
      body: {
        // TODO: Passing return_type to both the method and the body,
        // cleanup types so that one would do
        return_type,
        span,
        name: null,
        type_params,
        params,
        body,
        is_generator,
        is_async,
      },
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
      const type_params = parse_optional_type_params()
      if (type_params === ERR) return ERR

      switch (current_token.kind) {
        case t.LParen: {
          const params = parse_params_with_parens()
          if (params === ERR) return ERR
          const return_type = parse_optional_type_annotation()
          if (return_type === ERR) return ERR

          const body = parse_block()
          if (body === ERR) return ERR
          const span = Span.between(start, body.span)
          const method: MethodDef = {
            span,
            name,
            accessor_type: null,
            return_type,
            body: {
              // TODO: Passing return_type to both the method and the body,
              // cleanup types so that one would do
              return_type,
              type_params,
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
    const type_params = parse_optional_type_params()
    if (type_params === ERR) return ERR
    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    const return_type = parse_optional_type_annotation()
    if (return_type === ERR) return ERR
    const body = parse_block()
    if (body === ERR) return ERR
    const span = Span.between(start, body.span)

    if (accessor_type === AccessorType.Get && params.params.length > 0) {
      emit_error(`Getter method should not have any parameters`)
      // Could return an error node here, but continuing with processing
    }

    const method: MethodDef = {
      span,
      name,
      accessor_type,
      return_type,
      body: {
        span,
        // TODO: Passing return_type to both the method and the body,
        // cleanup types so that one would do
        type_params,
        return_type,
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

      const param = parse_param()
      if (param === ERR) return ERR
      params.push(param)

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
  function parse_param(): Param | Err {
    const pattern = parse_pattern()
    if (pattern === ERR) return ERR
    const type_annotation = parse_optional_type_annotation()
    if (type_annotation === ERR) return ERR
    return {
      span: pattern.span,
      pattern,
      type_annotation,
    }
  }
  function parse_optional_type_annotation(): TypeAnnotation | null | Err {
    if (flags & PARSER_FLAGS.ALLOW_TYPE_ANNOTATIONS && at(t.Colon)) {
      advance()
      return parse_type_annotation()
    } else {
      return null
    }
  }
  function parse_type_annotation(): TypeAnnotation | Err {
    let lhs = parse_array_type_annotation_or_below()
    if (lhs === ERR) return ERR
    while (true) {
      if (!at(t.VBar)) break
      advance()
      const rhs = parse_array_type_annotation_or_below()
      if (rhs === ERR) return ERR
      lhs = TypeAnnotation.Union(Span.between(lhs, rhs), lhs, rhs)
    }
    return lhs
  }
  function parse_array_type_annotation_or_below(): TypeAnnotation | Err {
    let head = parse_primary_type_annotation()
    if (head === ERR) return ERR

    loop: while (true) {
      switch (current_token.kind) {
        case t.LSquare: {
          advance()
          const end = expect(t.RSquare)
          if (end === ERR) return ERR
          head = TypeAnnotation.Array(Span.between(head, end), head)
          break
        }
        case t.LessThan: {
          advance()
          const args = parse_comma_separated_list(
            t.GreaterThan,
            parse_type_annotation,
          )
          if (args === ERR) return ERR
          const end = expect(t.GreaterThan)
          if (end === ERR) return ERR
          head = TypeAnnotation.Application(Span.between(head, end), head, args)
          break
        }
        default:
          break loop
      }
    }
    return head
  }
  function parse_primary_type_annotation(): TypeAnnotation | Err {
    switch (current_token.kind) {
      case t.Ident: {
        if (current_token.text === "readonly") {
          const start = advance()
          const annot = parse_array_type_annotation_or_below()
          if (annot === ERR) return ERR
          if (annot.kind !== "Array") {
            emit_error("The readonly can only be applied to array types")
            return annot
          }

          return TypeAnnotation.ReadonlyArray(
            Span.between(start, annot),
            annot.item,
          )
        }
        const ident = parse_ident()
        if (ident === ERR) return ERR
        return TypeAnnotation.Ident(ident.span, ident)
      }
      case t.Void: {
        const tok = advance()
        return TypeAnnotation.Ident(tok.span, {
          span: tok.span,
          text: "void",
        })
      }
      case t.Null: {
        const tok = advance()
        return TypeAnnotation.Ident(tok.span, {
          span: tok.span,
          text: "null",
        })
      }
      case t.String: {
        const tok = advance()
        return TypeAnnotation.String(tok.span, tok.text)
      }
      case t.LParen:
        return parse_parenthesized_or_func_type_annotation()
      default:
        return ERR
    }
  }

  function parse_parenthesized_or_func_type_annotation(): TypeAnnotation | Err {
    const start = advance()
    assert(start.kind === t.LParen)
    if (at(t.RParen) || (at(t.Ident) && next_is(t.Colon))) {
      const params = parse_comma_separated_list(t.RParen, parse_func_type_param)
      if (params === ERR) return ERR
      if (expect(t.RParen) === ERR) return ERR
      if (expect(t.FatArrow) === ERR) return ERR
      const returns = parse_type_annotation()
      if (returns === ERR) return ERR

      return TypeAnnotation.Func(Span.between(start, returns), params, returns)
    } else {
      const annotation = parse_type_annotation()
      if (annotation === ERR) return ERR
      if (expect(t.RParen) === ERR) return ERR
      return annotation
    }
  }
  function parse_func_type_param(): FuncTypeParam | Err {
    const label = parse_binding_ident()
    if (label === ERR) return ERR
    if (expect(t.Colon) === ERR) return ERR
    const type_annotation = parse_type_annotation()
    if (type_annotation === ERR) return ERR
    return { label, type_annotation }
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

  function parse_comma_semi_or_newline_separated_list<T>(
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
        if (at(t.Comma) || at(t.Semi)) {
          advance()
        } else if (last_token && last_token.line < current_token.line) {
        } else {
          emit_error(`Expected a comma, ; a newline or ${end_token}`)
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
      const params: ParamList = {
        span: pattern.span,
        params: [{ span: pattern.span, pattern, type_annotation: null }],
      }
      if (expect(t.FatArrow) === ERR) return ERR
      const body = parse_arrow_fn_body()
      if (body === ERR) return ERR
      return Expr.ArrowFn(
        Span.between(params.span, body.span),
        params,
        /* type_annotation */ null,
        body,
      )
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
    const return_type = parse_optional_type_annotation()
    if (return_type === ERR) return ERR
    if (expect(t.FatArrow) === ERR) return ERR

    const body = parse_arrow_fn_body()
    if (body === ERR) return ERR

    return Expr.ArrowFn(
      Span.between(params.span, body.span),
      params,
      return_type,
      body,
    )
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

    if (at(t.Colon)) {
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
        const e = parse_assignment_expr()
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
        (at(t.Comma) && next_is(t.RSquare) && elements.length > 0) ||
        at(t.RSquare) ||
        at(t.EndOfFile)
      ) {
        if (at(t.Comma)) advance()
        break
      } else if (at(t.DotDotDot)) {
        const start = advance()
        const expr = parse_assignment_expr()
        if (expr === ERR) return ERR
        elements.push(
          ArrayLiteralMember.Spread(Span.between(start, expr), expr),
        )
        if (at(t.RSquare)) break
        if (expect(t.Comma) === ERR) return ERR
      } else if (at(t.Comma)) {
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
  function next_is_soft_keyword(text: string): boolean {
    const token = next_token()
    return token.kind === t.Ident && token.text === text
  }
  function parse_stmt(export_token: Token | null = null): Stmt | Err {
    if (
      at(t.Export) &&
      (next_is(t.Function) ||
        next_is(t.Class) ||
        next_is(t.Var) ||
        next_is(t.Let) ||
        next_is(t.Const) ||
        next_is_soft_keyword("type"))
    ) {
      advance()
      return parse_stmt(export_token)
    }
    switch (current_token.kind) {
      case t.Let:
      case t.Const:
      case t.Var: {
        const decl = parse_var_decl()
        if (decl === ERR) return ERR
        return Stmt.VarDecl(decl.span, decl)
      }
      case t.Ident: {
        if (next_is(t.Colon)) {
          const label = parse_ident()
          assert(label !== ERR) // because of the lookahead above
          assert(advance().kind === t.Colon) // because of the lookahead above
          const stmt = parse_stmt()
          if (stmt === ERR) return ERR
          return Stmt.Labeled(
            Span.between(label.span, stmt.span),
            { span: label.span, name: label.text },
            stmt,
          )
        } else if (current_token.text === "type") {
          return parse_type_decl()
        } else {
          return parse_expr_stmt()
        }
      }
      case t.If:
        return parse_if_stmt()
      case t.Switch:
        return parse_switch_stmt()
      case t.While:
        return parse_while_stmt()
      case t.Do:
        return parse_do_while_stmt()
      case t.Try:
        return parse_try_stmt()
      case t.Return:
        return parse_return_stmt()
      case t.Semi: {
        const tok = advance()
        return Stmt.Empty(tok.span)
      }
      case t.LBrace: {
        const block = parse_block()
        if (block === ERR) return ERR
        return Stmt.Block(block.span, block)
      }
      case t.For: {
        const snapshot = create_snapshot()
        const for_stmt = parse_for_stmt()
        if (for_stmt === ERR) {
          restore_snapshot(snapshot)
          return parse_for_in_of_stmt()
        } else {
          return for_stmt
        }
      }
      case t.Break: {
        const span = advance().span
        if (at(t.Ident)) {
          const label_token = advance()
          const label = label_token.text
          return Stmt.Break(span, { span: label_token.span, name: label })
        }
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
      case t.Class: {
        const c = parse_class()
        if (c === ERR) return ERR
        return Stmt.ClassDecl(c.span, c)
      }
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
      case t.Import:
        return parse_import_stmt()
      default:
        return parse_expr_stmt()
    }
  }
  function parse_import_stmt(): Stmt | Err {
    const start = advance()
    assert(start.kind === t.Import)
    let default_import: Ident | null = null
    if (at(t.Ident)) {
      const token = advance()
      default_import = { span: token.span, text: token.text }
    }
    if (default_import) {
      if (at(t.Comma)) {
        advance()
      } else if (at(t.From)) {
        advance()
        const from_clause = expect(t.String)
        if (from_clause === ERR) return ERR
        if (expect_semi() === ERR) return ERR
        return Stmt.Import(
          Span.between(start, from_clause),
          default_import,
          [],
          from_clause.text,
        )
      } else {
        emit_error("Expected a comma or 'from'")
        return ERR
      }
    }
    if (expect(t.LBrace) === ERR) return ERR
    const import_specifiers = parse_comma_separated_list(
      t.RBrace,
      parse_import_specifier,
    )
    if (import_specifiers === ERR) return ERR
    if (expect(t.RBrace) === ERR) return ERR
    if (expect(t.From) === ERR) return ERR
    const from_clause = expect(t.String)
    if (from_clause === ERR) return ERR
    if (expect_semi() === ERR) return ERR
    return Stmt.Import(
      Span.between(start.span, from_clause.span),
      default_import,
      import_specifiers,
      from_clause.text,
    )
  }
  function parse_type_decl(): Stmt | Err {
    const start = advance()
    assert.equal(t.Ident, start.kind)
    assert.equal(start.text, "type")
    const ident = parse_ident()
    if (ident === ERR) return ERR
    if (expect(t.Eq) === ERR) return ERR
    if (at(t.LBrace)) {
      advance()
      const fields = parse_comma_semi_or_newline_separated_list(
        t.RBrace,
        parse_struct_type_decl_field,
      )
      if (fields === ERR) return ERR
      const last = expect(t.RBrace)
      if (last === ERR) return ERR
      return Stmt.StructTypeDecl(Span.between(start, last), ident, fields)
    } else {
      const type_annotation = parse_type_annotation()
      if (type_annotation === ERR) return ERR
      if (expect_semi() === ERR) return ERR
      return Stmt.TypeAlias(
        Span.between(ident, type_annotation),
        ident,
        type_annotation,
      )
    }
  }
  function parse_struct_type_decl_field(): StructTypeDeclField | Err {
    let is_readonly = false
    if (at(t.Ident) && next_is(t.Ident) && current_token.text === "readonly") {
      advance()
      is_readonly = true
    }
    const label = parse_binding_ident()
    if (label === ERR) return ERR
    if (expect(t.Colon) === ERR) return ERR
    const type_annotation = parse_type_annotation()
    if (type_annotation === ERR) return type_annotation
    return {
      is_readonly,
      label,
      type_annotation,
    }
  }

  function parse_import_specifier(): ImportSpecifier | Err {
    const start = current_token.span
    let type_only = false
    if (at(t.Ident) && current_token.text === "type") {
      advance()
      type_only = true
    }
    if (at(t.String)) {
      const tok = advance()
      if (expect(t.As) === ERR) return ERR
      const alias = parse_ident()
      if (alias === ERR) return ERR
      return {
        type_only: false,
        span: Span.between(start, alias),
        as_name: alias,
        imported_name: ModuleExportName.Ident({
          span: tok.span,
          text: tok.text,
        }),
      }
    }
    const name = parse_ident()
    if (name === ERR) return ERR
    if (at(t.As)) {
      advance()
      const alias = parse_ident()
      if (alias === ERR) return ERR
      return {
        type_only,
        span: Span.between(name.span, alias.span),
        as_name: alias,
        imported_name: ModuleExportName.Ident(name),
      }
    } else {
      return {
        type_only,
        span: Span.between(start, name),
        as_name: null,
        imported_name: ModuleExportName.Ident(name),
      }
    }
  }

  function parse_for_stmt(): Stmt | Err {
    assert(at(t.For))
    const first = advance()

    if (expect(t.LParen) === ERR) return ERR

    // Parse the initialization part
    let init: ForInit
    if (at(t.Let) || at(t.Const) || at(t.Var)) {
      const decl = parse_var_decl()
      if (decl === ERR) return ERR
      init = ForInit.VarDecl(decl)
    } else if (at(t.Semi)) {
      advance()
      // TODO: I have no idea why I defaulted to a 0 literal in the original rust code
      //       Figure out if this is correct. My guess is that ForStmt.init must be nullable
      //       and the correct thing to do here is `init = null`.
      init = ForInit.Expr(Expr.Number(first.span, "0")) // Default to 0
    } else {
      const expr = parse_expr()
      if (expr === ERR) return ERR

      // No ASI allowed here
      if (expect(t.Semi) === ERR) return ERR
      init = ForInit.Expr(expr)
    }

    // Parse the condition part
    let test: Expr | null = null
    if (at(t.Semi)) {
      advance()
    } else {
      const expr = parse_expr()
      if (expr === ERR) return ERR

      // No ASI allowed here
      if (expect(t.Semi) === ERR) return ERR
      test = expr
    }

    // Parse the update part
    let update: Expr | null = null
    if (!at(t.RParen)) {
      const expr = parse_expr()
      if (expr === ERR) return ERR
      update = expr
    }

    if (expect(t.RParen) === ERR) return ERR

    const body = parse_stmt()
    if (body === ERR) return ERR

    const span = Span.between(first.span, body.span)

    return Stmt.For(span, init, test, update, body)
  }
  function parse_for_in_of_stmt(): Stmt | Err {
    assert(at(t.For))
    const start = advance().span
    if (expect(t.LParen) === ERR) return ERR

    let decl_type: DeclType | null = null
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
    }

    const lhs = parse_pattern()
    if (lhs === ERR) return ERR

    let in_or_of: InOrOf
    switch (current_token.kind) {
      case t.In:
        advance()
        in_or_of = InOrOf.In
        break
      case t.Of:
        advance()
        in_or_of = InOrOf.Of
        break
      default:
        emit_error(`Expected 'in' or 'of', got ${current_token.kind}`)
        return ERR
    }

    const rhs = parse_assignment_expr()
    if (rhs === ERR) return ERR

    if (expect(t.RParen) === ERR) return ERR

    const body = parse_stmt()
    if (body === ERR) return ERR

    return Stmt.ForInOrOf(
      Span.between(start, body.span),
      decl_type,
      lhs,
      in_or_of,
      rhs,
      body,
    )
  }

  function parse_try_stmt(): Stmt | Err {
    const start = expect(t.Try)
    if (start === ERR) return ERR

    const try_block = parse_block()
    if (try_block === ERR) return ERR

    let catch_pattern: Pattern | null = null
    let catch_block: Block | null = null

    if (at(t.Catch)) {
      advance() // consume 'catch'

      if (at(t.LParen)) {
        advance() // consume '('
        const pattern = parse_pattern()
        if (pattern === ERR) return ERR
        catch_pattern = pattern

        if (expect(t.RParen) === ERR) return ERR

        const block = parse_block()
        if (block === ERR) return ERR
        catch_block = block
      } else {
        // Catch with no binding parameter
        const block = parse_block()
        if (block === ERR) return ERR
        catch_block = block
      }
    }

    let finally_block: Block | null = null
    if (at(t.Finally)) {
      advance() // consume 'finally'
      const block = parse_block()
      if (block === ERR) return ERR
      finally_block = block
    }

    // Determine the end span based on available blocks
    let end_span: Span
    if (finally_block !== null) {
      end_span = finally_block.span
    } else if (catch_block !== null) {
      end_span = catch_block.span
    } else {
      end_span = try_block.span
    }

    const span = Span.between(start.span, end_span)

    return Stmt.Try(span, try_block, catch_pattern, catch_block, finally_block)
  }
  function parse_switch_stmt(): Stmt | Err {
    const start_token = expect(t.Switch)
    if (start_token === ERR) return ERR

    const start = start_token.span
    if (expect(t.LParen) === ERR) return ERR
    const expr = parse_expr()
    if (expr === ERR) return ERR
    if (expect(t.RParen) === ERR) return ERR
    if (expect(t.LBrace) === ERR) return ERR

    const cases: Array<SwitchCase> = []

    while (!at(t.RBrace) && !at(t.EndOfFile)) {
      const case_stmt = parse_switch_case()
      if (case_stmt === ERR) return ERR
      cases.push(case_stmt)
    }

    const end = expect(t.RBrace)
    if (end === ERR) return ERR
    const span = Span.between(start, end.span)

    return Stmt.Switch(span, expr, cases)
  }

  function parse_switch_case(): SwitchCase | Err {
    if (at(t.Case)) {
      const start = expect(t.Case)
      if (start === ERR) return ERR
      const expr = parse_expr()
      if (expr === ERR) return ERR
      const colon = expect(t.Colon)
      if (colon === ERR) return ERR

      const stmts = parse_stmt_list(
        (tok) => tok === t.Case || tok === t.Default || tok === t.RBrace,
      )

      const end = stmts.length > 0 ? stmts[stmts.length - 1].span : colon.span

      return {
        span: Span.between(start.span, end),
        test: expr,
        body: stmts,
      }
    } else {
      const start = expect(t.Default)
      if (start === ERR) return ERR
      const colon = expect(t.Colon)
      if (colon === ERR) return ERR

      const stmts = parse_stmt_list(
        (tok) => tok === t.Case || tok === t.Default || tok === t.RBrace,
      )

      const end = stmts.length > 0 ? stmts[stmts.length - 1].span : colon.span

      return {
        span: Span.between(start.span, end),
        test: null,
        body: stmts,
      }
    }
  }
  function parse_while_stmt(): Stmt | Err {
    const start = advance().span // Consume the 'while' keyword

    if (expect(t.LParen) === ERR) return ERR

    const cond = parse_expr()
    if (cond === ERR) return ERR

    if (expect(t.RParen) === ERR) return ERR

    const body = parse_stmt()
    if (body === ERR) return ERR

    const span = Span.between(start, body.span)
    return Stmt.While(span, cond, body)
  }
  function parse_do_while_stmt(): Stmt | Err {
    const start = expect(t.Do)
    if (start === ERR) return ERR

    const body = parse_stmt()
    if (body === ERR) return ERR

    if (expect(t.While) === ERR) return ERR
    if (expect(t.LParen) === ERR) return ERR

    const cond = parse_expr()
    if (cond === ERR) return ERR

    if (expect(t.RParen) === ERR) return ERR

    expect_semi()

    return Stmt.DoWhile(Span.between(start.span, cond.span), body, cond)
  }
  function parse_return_stmt(): Stmt | Err {
    const start = expect(t.Return)
    if (start === ERR) return ERR

    let expr: Expr | null = null

    // Check if there's an expression after the return
    // We don't parse an expression if:
    // 1. The next token is a semicolon, right brace, or EOF
    // 2. The next token is on a new line (automatic semicolon insertion)
    if (
      !at(t.Semi) &&
      !at(t.RBrace) &&
      !at(t.EndOfFile) &&
      !current_is_on_new_line()
    ) {
      const parsedExpr = parse_expr()
      if (parsedExpr === ERR) return ERR
      expr = parsedExpr
    }

    const end_span = expr ? expr.span : start.span
    expect_semi()

    return Stmt.Return(Span.between(start.span, end_span), expr)
  }

  function parse_function(): Func | Err {
    const start = advance()

    const is_generator = at(t.Star)
    if (is_generator) {
      advance()
    }

    const name = at(t.Ident) ? parse_ident() : null
    if (name === ERR) return ERR
    const type_params = parse_optional_type_params()
    if (type_params === ERR) return ERR

    const params = parse_params_with_parens()
    if (params === ERR) return ERR
    const return_type = parse_optional_type_annotation()
    if (return_type === ERR) return ERR
    const body = parse_block()
    if (body === ERR) return ERR

    const span = Span.between(start.span, body.span)

    return {
      span,
      name,
      type_params,
      params,
      return_type,
      body,
      is_generator,
      is_async: false,
    }
  }
  function parse_optional_type_params(): readonly TypeParam[] | Err {
    if (!at(t.LessThan)) return []
    advance()
    const params = parse_comma_separated_list(
      t.GreaterThan,
      parse_binding_ident,
    )
    if (params === ERR) return ERR
    if (expect(t.GreaterThan) === ERR) return ERR
    return params.map((ident) => ({ ident }))
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
    const type_annotation = parse_optional_type_annotation()
    if (type_annotation === ERR) return ERR
    if (at(t.Eq)) {
      advance()
      const expr = parse_assignment_expr()
      if (expr === ERR) return ERR
      init = expr
    }

    return { pattern, type_annotation, init }
  }

  function can_start_arrow_fn(): boolean {
    assert(
      at(t.LParen),
      `Expected can_start_arrow_fn to be called when current token is a (, found ${current_token.kind}`,
    )
    const restore = fork()
    if (!expect(t.LParen)) return restore(false)
    const params = parse_comma_separated_list(t.RParen, parse_param)
    if (params === ERR) return restore(false)
    const rparen = expect(t.RParen)
    if (rparen === ERR) return restore(false)
    const last = advance()
    if (
      (last.kind === t.FatArrow || last.kind === t.Colon) &&
      last.line === rparen.line
    ) {
      return restore(true)
    }
    return restore(false)
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
    let parenthesized = false
    if (!at(t.LParen)) {
      emit_error("Expected '(' after 'if'")
    } else {
      parenthesized = true
      advance()
    }

    const cond = parse_expr()
    if (cond === ERR) return ERR
    if (parenthesized) {
      if (expect(t.RParen) === ERR) return ERR
    }

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
      const stmt = parse_stmt(/* top_level */)
      if (stmt === ERR) {
        recover_till_next_stmt()
        continue
      }
      stmts.push(stmt)
    }
    return { span, stmts, errors }
  }
  function at_any(...kinds: readonly TokenKind[]): boolean {
    return kinds.some((kind) => current_token.kind === kind)
  }
  function recover_till_next_stmt(): void {
    if (at(t.EndOfFile)) return
    do {
      advance()
      if (
        at_any(
          t.Function,
          t.Class,
          t.Let,
          t.Const,
          t.Var,
          t.If,
          t.For,
          t.While,
          t.Do,
          t.Switch,
          t.EndOfFile,
          t.Break,
          t.Return,
          t.Semi,
          t.Continue,
          t.Export,
          t.Import,
        ) ||
        (at(t.Ident) && next_is(t.LParen)) ||
        (at(t.Ident) && current_token.text === "type")
      ) {
        break
      }
    } while (true)
  }

  function at(token_kind: TokenKind): boolean {
    return current_token.kind === token_kind
  }
  function current_kind(): TokenKind {
    return current_token.kind
  }

  function advance(): Token {
    assert(current_token.kind !== t.EndOfFile, "Tried to advance past the EOF")
    previous_lexer = lexer.clone()
    last_token = current_token
    current_token = lexer.next()
    if (at(t.Error)) {
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
    case t.BarEq:
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
