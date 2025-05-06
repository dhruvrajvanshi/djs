import { TokenKind } from "./TokenKind.js"
import { Token } from "./Token.js"
import assert, { AssertionError } from "node:assert"

export interface Lexer {
  clone(): Lexer
  next(): Token
}
export function Lexer(input: string) {
  return lexer_impl(
    input,
    /* line */ 1,
    /* span_start */ 0,
    /* index */ 0,
    /* regex_enabled */ false,
    /* template_literal_interpolation */ false,
  )
}

export function lexer_impl(
  input: string,
  _line: number,
  _span_start: number,
  _index: number,
  _regex_enabled: boolean,
  _template_literal_interpolation: boolean,
): Lexer {
  let line = _line
  let span_start = _span_start
  let current_index = _index
  let regex_enabled = _regex_enabled
  let template_literal_interpolation = _template_literal_interpolation
  return {
    clone(): Lexer {
      return lexer_impl(
        input,
        line,
        span_start,
        current_index,
        regex_enabled,
        template_literal_interpolation,
      )
    },
    next,
  }
  function at(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (current_index + i >= input.length) {
        return false
      }
      if (input[current_index + i] !== text[i]) {
        return false
      }
    }
    return true
  }
  function lex_n_char_token(n: number, kind: TokenKind): Token {
    for (let i = 0; i < n; i++) {
      advance()
    }
    return make_token(kind)
  }
  function lex_single_char_token(kind: TokenKind): Token {
    advance()
    return make_token(kind)
  }
  function lex_2_char_token(kind: TokenKind): Token {
    advance()
    advance()
    return make_token(kind)
  }
  function lex_3_char_token(kind: TokenKind): Token {
    advance()
    advance()
    advance()
    return make_token(kind)
  }

  function next(): Token {
    skip_whitespace_and_comments()
    span_start = current_index
    if (current_char() === "\0") {
      return make_token(TokenKind.EndOfFile)
    } else if (is_identifier_start(current_char())) {
      return lex_ident_or_keyword()
    }

    // '{' => self.lex_single_char_token(TokenKind::LBrace),
    else if (at("{")) {
      return lex_single_char_token(TokenKind.LBrace)
    }
    // '}' if self.template_literal_interpolation => {
    //     self.end_template_literal_interpolation();
    //     self.lex_template_literal_post_interpolation()
    // }
    else if (at("}") && template_literal_interpolation) {
      template_literal_interpolation = false
      return lex_template_literal_post_interpolation()
    }
    // '}' => self.lex_single_char_token(TokenKind::RBrace),
    else if (at("}")) {
      return lex_single_char_token(TokenKind.RBrace)
    }
    // '(' => self.lex_single_char_token(TokenKind::LParen),
    else if (at("(")) {
      return lex_single_char_token(TokenKind.LParen)
    }
    // ')' => self.lex_single_char_token(TokenKind::RParen),
    else if (at(")")) {
      return lex_single_char_token(TokenKind.RParen)
    }
    // ';' => self.lex_single_char_token(TokenKind::Semi),
    else if (at(";")) {
      return lex_single_char_token(TokenKind.Semi)
    }
    // '[' => self.lex_single_char_token(TokenKind::LSquare),
    else if (at("[")) {
      return lex_single_char_token(TokenKind.LSquare)
    }
    // ']' => self.lex_single_char_token(TokenKind::RSquare),
    else if (at("]")) {
      return lex_single_char_token(TokenKind.RSquare)
    }
    // ',' => self.lex_single_char_token(TokenKind::Comma),
    else if (at(",")) {
      return lex_single_char_token(TokenKind.Comma)
    }
    // ':' => self.lex_single_char_token(TokenKind::Colon),
    else if (at(":")) {
      return lex_single_char_token(TokenKind.Colon)
    }
    // _ if at!("...") => self.lex_3_char_token(TokenKind::DotDotDot),
    else if (at("...")) {
      return lex_3_char_token(TokenKind.DotDotDot)
    }
    // '.' => self.lex_single_char_token(TokenKind::Dot),
    else if (at(".")) {
      return lex_single_char_token(TokenKind.Dot)
    }

    // _ if at!("&&=") => self.lex_3_char_token(TokenKind::AmpAmpEq),
    else if (at("&&=")) {
      return lex_3_char_token(TokenKind.AmpAmpEq)
    }
    // _ if at!("||=") => self.lex_3_char_token(TokenKind::BarBarEq),
    else if (at("||=")) {
      return lex_3_char_token(TokenKind.BarBarEq)
    }
    // _ if at!("??=") => self.lex_3_char_token(TokenKind::QuestionQuestionEq),
    else if (at("??=")) {
      return lex_3_char_token(TokenKind.QuestionQuestionEq)
    }
    // _ if at!("*=") => self.lex_2_char_token(TokenKind::StarEq),
    else if (at("*=")) {
      return lex_2_char_token(TokenKind.StarEq)
    }
    // _ if at!("/=") => self.lex_2_char_token(TokenKind::SlashEq),
    else if (at("/=")) {
      return lex_2_char_token(TokenKind.SlashEq)
    }
    // _ if at!("%=") => self.lex_2_char_token(TokenKind::PercentEq),
    else if (at("%=")) {
      return lex_2_char_token(TokenKind.PercentEq)
    }
    // _ if at!("+=") => self.lex_2_char_token(TokenKind::PlusEq),
    else if (at("+=")) {
      return lex_2_char_token(TokenKind.PlusEq)
    }
    // _ if at!("-=") => self.lex_2_char_token(TokenKind::MinusEq),
    else if (at("-=")) {
      return lex_2_char_token(TokenKind.MinusEq)
    }
    // _ if at!("<<=") => self.lex_3_char_token(TokenKind::LessThanLessThanEq),
    else if (at("<<=")) {
      return lex_3_char_token(TokenKind.LessThanLessThanEq)
    }
    // _ if at!("<<") => self.lex_3_char_token(TokenKind::LessThanLessThan),
    else if (at("<<")) {
      return lex_2_char_token(TokenKind.LessThanLessThan)
    }
    // _ if at!(">>=") => self.lex_3_char_token(TokenKind::GreaterThanGreaterThanEq),
    else if (at(">>=")) {
      return lex_3_char_token(TokenKind.GreaterThanGreaterThanEq)
    }
    // _ if at!(">>>=") => {
    //     self.lex_4_char_token(TokenKind::GreaterThanGreaterThanGreaterThanEq)
    // }
    else if (at(">>>=")) {
      return lex_n_char_token(4, TokenKind.GreaterThanGreaterThanGreaterThanEq)
    }
    // _ if at!(">>>") => self.lex_3_char_token(TokenKind::GreaterThanGreaterThanGreaterThan),
    else if (at(">>>")) {
      return lex_3_char_token(TokenKind.GreaterThanGreaterThanGreaterThan)
    }
    // _ if at!("&=") => self.lex_2_char_token(TokenKind::AmpEq),
    else if (at("&=")) {
      return lex_2_char_token(TokenKind.AmpEq)
    }
    // _ if at!("^=") => self.lex_2_char_token(TokenKind::CaretEq),
    else if (at("^=")) {
      return lex_2_char_token(TokenKind.CaretEq)
    }
    // _ if at!("|=") => self.lex_2_char_token(TokenKind::BarEq),
    else if (at("|=")) {
      return lex_2_char_token(TokenKind.BarEq)
    }
    // _ if at!("**=") => self.lex_3_char_token(TokenKind::StarStarEq),
    else if (at("**=")) {
      return lex_3_char_token(TokenKind.StarStarEq)
    }
    // '%' => self.lex_single_char_token(TokenKind::Percent),
    else if (at("%")) {
      return lex_single_char_token(TokenKind.Percent)
    }
    // '*' => self.lex_single_char_token(TokenKind::Star),
    else if (at("*")) {
      return lex_single_char_token(TokenKind.Star)
    }
    // '~' => self.lex_single_char_token(TokenKind::Tilde),
    else if (at("~")) {
      return lex_single_char_token(TokenKind.Tilde)
    }
    // '/' if self.regex_enabled => self.lex_regex(),

    // '/' => self.lex_single_char_token(TokenKind::Slash),
    else if (at("/")) {
      return lex_single_char_token(TokenKind.Slash)
    }
    // '?' => self.lex_single_char_token(TokenKind::Question),
    else if (at("?")) {
      return lex_single_char_token(TokenKind.Question)
    }
    // '"' | '\'' => self.lex_simple_string(),
    else if (at('"') || at("'")) {
      return lex_simple_string()
    }
    // '`' => self.lex_template_literal_start(),
    else if (at("`")) {
      return lex_template_literal_start()
    }

    // _ if at!("<=") => self.lex_2_char_token(TokenKind::LessThanEq),
    else if (at("<=")) {
      return lex_2_char_token(TokenKind.LessThanEq)
    }
    // '<' => self.lex_single_char_token(TokenKind::LessThan),
    else if (at("<")) {
      return lex_single_char_token(TokenKind.LessThan)
    }

    // _ if at!(">=") => self.lex_2_char_token(TokenKind::GreaterThanEq),
    else if (at(">=")) {
      return lex_2_char_token(TokenKind.GreaterThanEq)
    }
    // '>' => self.lex_single_char_token(TokenKind::GreaterThan),
    else if (at(">")) {
      return lex_single_char_token(TokenKind.GreaterThan)
    }

    // _ if at!("!==") => self.lex_3_char_token(TokenKind::BangEqEq),
    else if (at("!==")) {
      return lex_3_char_token(TokenKind.BangEqEq)
    }
    // _ if at!("!=") => self.lex_2_char_token(TokenKind::BangEq),
    else if (at("!=")) {
      return lex_2_char_token(TokenKind.BangEq)
    }
    // '!' => self.lex_single_char_token(TokenKind::Bang),
    else if (at("!")) {
      return lex_single_char_token(TokenKind.Bang)
    }

    // _ if at!("===") => self.lex_3_char_token(TokenKind::EqEqEq),
    else if (at("===")) {
      return lex_3_char_token(TokenKind.EqEqEq)
    }
    // _ if at!("==") => self.lex_2_char_token(TokenKind::EqEq),
    else if (at("==")) {
      return lex_2_char_token(TokenKind.EqEq)
    }
    // _ if at!("=>") => self.lex_2_char_token(TokenKind::FatArrow),
    else if (at("=>")) {
      return lex_2_char_token(TokenKind.FatArrow)
    }
    // '=' => self.lex_single_char_token(TokenKind::Eq),
    else if (at("=")) {
      return lex_single_char_token(TokenKind.Eq)
    }

    // _ if at!("++") => self.lex_2_char_token(TokenKind::PlusPlus),
    else if (at("++")) {
      return lex_2_char_token(TokenKind.PlusPlus)
    }
    // '+' => self.lex_single_char_token(TokenKind::Plus),
    else if (at("+")) {
      return lex_single_char_token(TokenKind.Plus)
    }

    // _ if at!("--") => self.lex_2_char_token(TokenKind::MinusMinus),
    else if (at("--")) {
      return lex_2_char_token(TokenKind.MinusMinus)
    }
    // '-' => self.lex_single_char_token(TokenKind::Minus),
    else if (at("-")) {
      return lex_single_char_token(TokenKind.Minus)
    }

    // _ if at!("&&") => self.lex_2_char_token(TokenKind::AmpAmp),
    else if (at("&&")) {
      return lex_2_char_token(TokenKind.AmpAmp)
    }
    // '&' => self.lex_single_char_token(TokenKind::Amp),
    else if (at("&")) {
      return lex_single_char_token(TokenKind.Amp)
    }

    // _ if at!("||") => self.lex_2_char_token(TokenKind::VBarVBar),
    else if (at("||")) {
      return lex_2_char_token(TokenKind.VBarVBar)
    }
    // '|' => self.lex_single_char_token(TokenKind::VBar),
    else if (at("|")) {
      return lex_single_char_token(TokenKind.VBar)
    }

    // '^' => self.lex_single_char_token(TokenKind::Caret),
    else if (at("^")) {
      return lex_single_char_token(TokenKind.Caret)
    } else if (is_ascii_digit(current_char())) {
      return lex_number()
    } else {
      let limit = 100
      while (current_char() !== "\0" && !is_whitespace(current_char())) {
        limit--
        if (limit <= 0) {
          break
        }
        advance()
      }
      return make_token(TokenKind.Error)
    }
  }
  function skip_whitespace_and_comments(): void {
    while (is_whitespace(current_char()) || at_comment()) {
      if (is_whitespace(current_char())) {
        skip_whitespace()
      } else {
        skip_comment()
      }
    }
  }

  function skip_whitespace(): void {
    while (is_whitespace(current_char())) {
      advance()
    }
  }

  function at_comment(): boolean {
    return (
      (current_char() === "/" && next_char() === "/") ||
      (current_char() === "/" && next_char() === "*")
    )
  }

  function skip_comment(): void {
    const first = advance()
    assert(first === "/", "Expected '/' at the start of a comment")

    const second = advance()
    assert(second === "/" || second === "*", "Expected '/' or '*' after '/'")

    if (second === "/") {
      // Line comment
      while (current_char() !== "\n" && current_char() !== "\0") {
        advance()
      }
    } else {
      // Block comment
      while (true) {
        const c = advance()
        if (c === "\0") {
          throw new Error(`Unclosed block comment at line ${line}`)
        }
        if (c === "*" && current_char() === "/") {
          advance() // Consume the closing '/'
          break
        }
      }
    }
  }
  function lex_number(): Token {
    while (is_ascii_digit(current_char())) {
      advance()
    }
    return make_token(TokenKind.Number)
  }

  function lex_simple_string(): Token {
    // Verify we're starting with a quote character
    assert(
      current_char() === '"' || current_char() === "'",
      "Expected a quote character",
    )

    const quote = advance()

    while (current_char() !== "\0" && current_char() !== quote) {
      const c = advance()

      if (c === "\\") {
        if (current_char() === "u" || current_char() === "x") {
          const err = consume_unicode_or_hex_escape()
          if (err) return error_token(err)
        } else if (
          c !== "\\" &&
          c !== "b" &&
          c !== "f" &&
          c !== "n" &&
          c !== "r" &&
          c !== "t" &&
          c !== "v" &&
          c !== "'" &&
          c !== '"' &&
          c !== "\n"
        ) {
          return error_token(
            `Invalid escape sequence: ${current_char()} at line ${line}`,
          )
        } else {
          advance()
        }
      }
    }
    if (current_char() === "\0") {
      return error_token(`Unclosed string literal`)
    }

    const end_quote = advance()

    if (end_quote !== quote) {
      throw new Error(
        `Unclosed string literal, expected ${quote} at line ${line}`,
      )
    }

    return make_token(TokenKind.String)
  }
  function error_token(message: string): Token {
    return {
      kind: TokenKind.Error,
      span: { start: span_start, stop: current_index },
      line,
      text: message,
    }
  }
  function lex_template_literal_start(): Token {
    assert(current_char() === "`", "Expected backtick character")
    advance()

    while (true) {
      const current = current_char()

      if (current === "\\") {
        advance()
        if (current_char() === "u" || current_char() === "x") {
          const err = consume_unicode_or_hex_escape()
          if (err) return error_token(err)
        } else {
          advance()
        }
      } else if (current === "`") {
        advance()
        return make_token(TokenKind.TemplateLiteralFragment)
      } else if (current === "$") {
        if (next_char() === "{") {
          advance() // Consume $
          advance() // Consume {
          template_literal_interpolation = true
          return make_token(TokenKind.TemplateLiteralFragment)
        } else {
          advance()
        }
      } else if (current === "\0") {
        throw new Error(
          `Unclosed template literal at line ${line}, expected \``,
        )
      } else {
        advance()
      }
    }
  }
  function lex_template_literal_post_interpolation(): Token {
    assert(current_char() === "}", "Expected closing brace")
    advance()

    while (true) {
      const current = current_char()

      if (current === "\\") {
        advance()
        if (current_char() === "u" || current_char() === "x") {
          const err = consume_unicode_or_hex_escape()
          if (err) return error_token(err)
        } else {
          advance()
        }
      } else if (current === "`") {
        advance()
        return make_token(TokenKind.TemplateLiteralFragment)
      } else if (current === "$") {
        if (next_char() === "{") {
          advance() // Consume $
          advance() // Consume {
          template_literal_interpolation = true
          return make_token(TokenKind.TemplateLiteralFragment)
        } else {
          advance()
        }
      } else if (current === "\0") {
        throw new Error(
          `Unclosed template literal at line ${line}, expected \``,
        )
      } else {
        advance()
      }
    }
  }

  /**
   * Returns an error message string if the escape sequence is invalid.
   */
  function consume_unicode_or_hex_escape(): string | void {
    // Verify we're starting with 'u' or 'x'
    assert(
      current_char() === "u" || current_char() === "x",
      "Expected 'u' or 'x'",
    )

    const first = advance()

    if (first === "u" && current_char() === "{") {
      // Unicode code point escape: \u{XXXXXX}
      advance()
      const start_offset = current_index
      let end_offset = start_offset

      while (current_char() !== "}" && current_char() !== "\0") {
        const c = advance()
        if (!is_hex_digit(c)) {
          return `Expected a hex character but got '${c}'`
        } else {
          end_offset = current_index
        }
      }

      const hex_string = input.slice(start_offset, end_offset)
      // Validate code point is between 0x0 and 0x10FFFF inclusive
      const code_point = parseInt(hex_string, 16)

      if (isNaN(code_point) || code_point > 0x10ffff) {
        return `Code point must be between 0x0 and 0x10FFFF inclusive`
      }

      const last = advance()
      if (last !== "}") {
        return `Expected '}' but reached end of input`
      }
    } else if (first === "u") {
      // Fixed-length Unicode escape: \uXXXX (exactly 4 hex digits)
      for (let i = 0; i < 4; i++) {
        const c = advance()
        if (!is_hex_digit(c)) {
          return `Expected a hex character but got '${c}'`
        }
      }
    } else if (first === "x") {
      // Hexadecimal escape: \xXX (exactly 2 hex digits)
      for (let i = 0; i < 2; i++) {
        const c = advance()
        if (!is_hex_digit(c)) {
          return `Expected a hex character but got '${c}'`
        }
      }
    }
  }

  function lex_ident_or_keyword(): Token {
    while (is_identifier_char(current_char())) {
      advance()
    }
    const token_kind = TokenKind.keyword_kind(current_text()) ?? TokenKind.Ident
    return make_token(token_kind)
  }
  function current_text() {
    return input.slice(span_start, current_index)
  }

  function make_token(kind: TokenKind): Token {
    assert(typeof kind === "string", "Expected kind to be a string")
    return {
      kind,
      span: { start: span_start, stop: current_index },
      line,
      text:
        kind === TokenKind.Ident ||
        kind === TokenKind.String ||
        kind === TokenKind.Number
          ? current_text()
          : "",
    }
  }
  function current_char(): string {
    return input[current_index] ?? "\0"
  }
  function next_char(): string {
    return input[current_index + 1] ?? "\0"
  }

  function advance(): string {
    if (current_index >= input.length) {
      throw new AssertionError({
        message: "End of input",
        stackStartFn: advance,
      })
    }
    let last_char = input[current_index]
    current_index++
    if (last_char === "\n") {
      line++
    }
    return last_char
  }
}

function is_whitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r"
}
function is_ascii_digit(c: string): boolean {
  return c >= "0" && c <= "9"
}
function is_alphabet(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")
}
function is_identifier_start(c: string): boolean {
  return is_alphabet(c) || c == "_" || c == "$"
}

function is_identifier_char(c: string): boolean {
  return is_identifier_start(c) || is_ascii_digit(c)
}

function is_hex_digit(c: string): boolean {
  return (
    (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")
  )
}
