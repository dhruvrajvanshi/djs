import { TokenKind, Token } from "djs_ast"
import assert, { AssertionError } from "node:assert"

export type Lexer = {
  clone: () => Lexer
  next: () => Token
  start_template_literal_interpolation: () => void
  end_template_literal_interpolation: () => void
  enable_regex: () => void
  disable_regex: () => void
}
export function Lexer(input: string) {
  return lexer_impl({
    input,
    line: 1,
    span_start: 0,
    current_index: 0,
    regex_enabled: false,
    template_literal_interpolation: false,
    leading_trivia: "",
  })
}

type LexerState = {
  input: string
  line: number
  span_start: number
  current_index: number
  regex_enabled: boolean
  template_literal_interpolation: boolean
  leading_trivia: string
}

class Err {
  message: string
  constructor(message: string) {
    this.message = message
  }
}

function lexer_state_advance(self: LexerState): string {
  if (self.current_index >= self.input.length) {
    throw new AssertionError({
      message: "End of input",
      stackStartFn: lexer_state_advance,
    })
  }
  let last_char = self.input[self.current_index]
  self.current_index++
  if (last_char === "\n") {
    self.line++
  }
  return last_char
}
function lexer_state_clone(self: LexerState): LexerState {
  return { ...self }
}

export function lexer_impl(self: LexerState): Lexer {
  return {
    clone(): Lexer {
      return lexer_impl(lexer_state_clone(self))
    },
    next,
    start_template_literal_interpolation,
    end_template_literal_interpolation,
    enable_regex,
    disable_regex,
  }
  function enable_regex(): void {
    self.regex_enabled = true
  }
  function disable_regex(): void {
    self.regex_enabled = false
  }
  function start_template_literal_interpolation(): void {
    self.template_literal_interpolation = true
  }
  function end_template_literal_interpolation(): void {
    self.template_literal_interpolation = false
  }
  function at(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (self.current_index + i >= self.input.length) {
        return false
      }
      if (self.input[self.current_index + i] !== text[i]) {
        return false
      }
    }
    return true
  }
  function advance() {
    return lexer_state_advance(self)
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
    const leading_trivia = skip_whitespace_and_comments()
    if (leading_trivia instanceof Err)
      return error_token(leading_trivia.message)
    self.leading_trivia = leading_trivia
    self.span_start = self.current_index
    if (current_char() === "\0") {
      return make_token(TokenKind.EndOfFile)
    } else if (is_identifier_start(current_char())) {
      return lex_ident_or_keyword()
    }

    // '{' => self.lex_single_char_token(TokenKind::LBrace),
    else if (at("{")) return lex_single_char_token(TokenKind.LBrace)
    // '}' if self.template_literal_interpolation => {
    //     self.end_template_literal_interpolation();
    //     self.lex_template_literal_post_interpolation()
    // }
    else if (at("}") && self.template_literal_interpolation) {
      self.template_literal_interpolation = false
      return lex_template_literal_post_interpolation()
    }
    // '}' => self.lex_single_char_token(TokenKind::RBrace),
    else if (at("}")) return lex_single_char_token(TokenKind.RBrace)
    // '(' => self.lex_single_char_token(TokenKind::LParen),
    else if (at("(")) return lex_single_char_token(TokenKind.LParen)
    // ')' => self.lex_single_char_token(TokenKind::RParen),
    else if (at(")")) return lex_single_char_token(TokenKind.RParen)
    // ';' => self.lex_single_char_token(TokenKind::Semi),
    else if (at(";")) return lex_single_char_token(TokenKind.Semi)
    // '[' => self.lex_single_char_token(TokenKind::LSquare),
    else if (at("[")) return lex_single_char_token(TokenKind.LSquare)
    // ']' => self.lex_single_char_token(TokenKind::RSquare),
    else if (at("]")) return lex_single_char_token(TokenKind.RSquare)
    // ',' => self.lex_single_char_token(TokenKind::Comma),
    else if (at(",")) return lex_single_char_token(TokenKind.Comma)
    // ':' => self.lex_single_char_token(TokenKind::Colon),
    else if (at(":")) return lex_single_char_token(TokenKind.Colon)
    // _ if at!("...") => self.lex_3_char_token(TokenKind::DotDotDot),
    else if (at("...")) return lex_3_char_token(TokenKind.DotDotDot)
    // '.' => self.lex_single_char_token(TokenKind::Dot),
    else if (at(".")) return lex_single_char_token(TokenKind.Dot)
    // _ if at!("&&=") => self.lex_3_char_token(TokenKind::AmpAmpEq),
    else if (at("&&=")) return lex_3_char_token(TokenKind.AmpAmpEq)
    // _ if at!("||=") => self.lex_3_char_token(TokenKind::BarBarEq),
    else if (at("||=")) return lex_3_char_token(TokenKind.BarBarEq)
    // _ if at!("??=") => self.lex_3_char_token(TokenKind::QuestionQuestionEq),
    else if (at("??=")) return lex_3_char_token(TokenKind.QuestionQuestionEq)
    else if (at("??")) return lex_2_char_token(TokenKind.QuestionQuestion)
    else if (at("?.")) return lex_2_char_token(TokenKind.QuestionDot)
    // _ if at!("*=") => self.lex_2_char_token(TokenKind::StarEq),
    else if (at("*=")) return lex_2_char_token(TokenKind.StarEq)
    // _ if at!("/=") => self.lex_2_char_token(TokenKind::SlashEq),
    else if (at("/=")) return lex_2_char_token(TokenKind.SlashEq)
    // _ if at!("%=") => self.lex_2_char_token(TokenKind::PercentEq),
    else if (at("%=")) return lex_2_char_token(TokenKind.PercentEq)
    // _ if at!("+=") => self.lex_2_char_token(TokenKind::PlusEq),
    else if (at("+=")) return lex_2_char_token(TokenKind.PlusEq)
    // _ if at!("-=") => self.lex_2_char_token(TokenKind::MinusEq),
    else if (at("-=")) return lex_2_char_token(TokenKind.MinusEq)
    // _ if at!("<<=") => self.lex_3_char_token(TokenKind::LessThanLessThanEq),
    else if (at("<<=")) return lex_3_char_token(TokenKind.LessThanLessThanEq)
    // _ if at!("<<") => self.lex_3_char_token(TokenKind::LessThanLessThan),
    else if (at("<<")) return lex_2_char_token(TokenKind.LessThanLessThan)
    // _ if at!(">>=") => self.lex_3_char_token(TokenKind::GreaterThanGreaterThanEq),
    else if (at(">>="))
      return lex_3_char_token(TokenKind.GreaterThanGreaterThanEq)
    // _ if at!(">>>=") => {
    //     self.lex_4_char_token(TokenKind::GreaterThanGreaterThanGreaterThanEq)
    // }
    else if (at(">>>="))
      return lex_n_char_token(4, TokenKind.GreaterThanGreaterThanGreaterThanEq)
    // _ if at!(">>>") => self.lex_3_char_token(TokenKind::GreaterThanGreaterThanGreaterThan),
    else if (at(">>>"))
      return lex_3_char_token(TokenKind.GreaterThanGreaterThanGreaterThan)
    // _ if at!("&=") => self.lex_2_char_token(TokenKind::AmpEq),
    else if (at("&=")) return lex_2_char_token(TokenKind.AmpEq)
    // _ if at!("^=") => self.lex_2_char_token(TokenKind::CaretEq),
    else if (at("^=")) return lex_2_char_token(TokenKind.CaretEq)
    // _ if at!("|=") => self.lex_2_char_token(TokenKind::BarEq),
    else if (at("|=")) return lex_2_char_token(TokenKind.BarEq)
    // _ if at!("**=") => self.lex_3_char_token(TokenKind::StarStarEq),
    else if (at("**=")) return lex_3_char_token(TokenKind.StarStarEq)
    else if (at("**")) return lex_2_char_token(TokenKind.StarStar)
    // '%' => self.lex_single_char_token(TokenKind::Percent),
    else if (at("%")) return lex_single_char_token(TokenKind.Percent)
    // '*' => self.lex_single_char_token(TokenKind::Star),
    else if (at("*")) return lex_single_char_token(TokenKind.Star)
    // '~' => self.lex_single_char_token(TokenKind::Tilde),
    else if (at("~")) return lex_single_char_token(TokenKind.Tilde)
    // '/' if self.regex_enabled => self.lex_regex(),
    else if (self.regex_enabled && at("/")) return lex_regex()
    // '/' => self.lex_single_char_token(TokenKind::Slash),
    else if (at("/")) return lex_single_char_token(TokenKind.Slash)
    // '?' => self.lex_single_char_token(TokenKind::Question),
    else if (at("?")) return lex_single_char_token(TokenKind.Question)
    // '"' | '\'' => self.lex_simple_string(),
    else if (at('"') || at("'")) return lex_simple_string()
    // '`' => self.lex_template_literal_start(),
    else if (at("`")) return lex_template_literal_start()
    // _ if at!("<=") => self.lex_2_char_token(TokenKind::LessThanEq),
    else if (at("<=")) return lex_2_char_token(TokenKind.LessThanEq)
    // '<' => self.lex_single_char_token(TokenKind::LessThan),
    else if (at("<")) return lex_single_char_token(TokenKind.LessThan)
    // _ if at!(">=") => self.lex_2_char_token(TokenKind::GreaterThanEq),
    else if (at(">=")) return lex_2_char_token(TokenKind.GreaterThanEq)
    // '>' => self.lex_single_char_token(TokenKind::GreaterThan),
    else if (at(">")) return lex_single_char_token(TokenKind.GreaterThan)
    // _ if at!("!==") => self.lex_3_char_token(TokenKind::BangEqEq),
    else if (at("!==")) return lex_3_char_token(TokenKind.BangEqEq)
    // _ if at!("!=") => self.lex_2_char_token(TokenKind::BangEq),
    else if (at("!=")) return lex_2_char_token(TokenKind.BangEq)
    // '!' => self.lex_single_char_token(TokenKind::Bang),
    else if (at("!")) return lex_single_char_token(TokenKind.Bang)
    // _ if at!("===") => self.lex_3_char_token(TokenKind::EqEqEq),
    else if (at("===")) return lex_3_char_token(TokenKind.EqEqEq)
    // _ if at!("==") => self.lex_2_char_token(TokenKind::EqEq),
    else if (at("==")) return lex_2_char_token(TokenKind.EqEq)
    // _ if at!("=>") => self.lex_2_char_token(TokenKind::FatArrow),
    else if (at("=>")) return lex_2_char_token(TokenKind.FatArrow)
    // '=' => self.lex_single_char_token(TokenKind::Eq),
    else if (at("=")) return lex_single_char_token(TokenKind.Eq)
    // _ if at!("++") => self.lex_2_char_token(TokenKind::PlusPlus),
    else if (at("++")) return lex_2_char_token(TokenKind.PlusPlus)
    // '+' => self.lex_single_char_token(TokenKind::Plus),
    else if (at("+")) return lex_single_char_token(TokenKind.Plus)
    // _ if at!("--") => self.lex_2_char_token(TokenKind::MinusMinus),
    else if (at("--")) return lex_2_char_token(TokenKind.MinusMinus)
    // '-' => self.lex_single_char_token(TokenKind::Minus),
    else if (at("-")) return lex_single_char_token(TokenKind.Minus)
    // _ if at!("&&") => self.lex_2_char_token(TokenKind::AmpAmp),
    else if (at("&&")) return lex_2_char_token(TokenKind.AmpAmp)
    // '&' => self.lex_single_char_token(TokenKind::Amp),
    else if (at("&")) return lex_single_char_token(TokenKind.Amp)
    // _ if at!("||") => self.lex_2_char_token(TokenKind::VBarVBar),
    else if (at("||")) return lex_2_char_token(TokenKind.VBarVBar)
    // '|' => self.lex_single_char_token(TokenKind::VBar),
    else if (at("|")) return lex_single_char_token(TokenKind.VBar)
    // '^' => self.lex_single_char_token(TokenKind::Caret),
    else if (at("^")) return lex_single_char_token(TokenKind.Caret)
    // _ if at!("0x") || at!("0X") => self.lex_hex_number(),
    else if (at("0x") || at("0X")) return lex_hex_number()
    // _ if at!("0o") || at!("0O") => self.lex_octal_number(),
    else if (at("0o") || at("0O")) return lex_octal_number()
    // _ if at!("0b") || at!("0b") => self.lex_binary_number(),
    else if (at("0b") || at("0B")) return lex_binary_number()
    else if (at("@")) return lex_decorator_ident()
    // c if c.is_ascii_digit() => self.lex_number(),
    else if (is_ascii_digit(current_char())) return lex_number()
    else {
      const c = current_char()
      let limit = 100
      while (current_char() !== "\0" && !is_whitespace(current_char())) {
        limit--
        if (limit <= 0) {
          break
        }
        advance()
      }
      return error_token(
        `Unexpected character: '${c}' (code point: ${c.codePointAt(0)})`,
      )
    }
  }
  type Trivia = string
  function skip_whitespace_and_comments(): Trivia | Err {
    let trivia: Trivia = ""
    while (is_whitespace(current_char()) || at_comment()) {
      if (is_whitespace(current_char())) {
        skip_whitespace()
      } else {
        const start_offset = self.current_index
        const err = skip_comment()
        if (err) return err
        trivia = self.input.slice(start_offset, self.current_index)
      }
    }
    return trivia
  }

  function skip_whitespace(): void {
    while (is_whitespace(current_char())) {
      advance()
    }
  }

  function at_comment(): boolean {
    return (
      (current_char() === "/" && next_char() === "/") ||
      at("<!--") ||
      (current_char() === "/" && next_char() === "*")
    )
  }

  function skip_comment(): string | void {
    if (at("<!--")) {
      while (current_char() !== "\n" && current_char() !== "\0") {
        advance()
      }
      return
    }
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
        if (current_char() === "\0") {
          return "Unclosed block comment"
        }
        const c = advance()

        if (c === "*" && current_char() === "/") {
          advance() // Consume the closing '/'
          break
        }
      }
    }
  }

  function lex_number(): Token {
    const start = advance()
    assert(is_ascii_digit(start), "Expected a digit at the start of a number")

    // Parse integer part (and potentially decimal point + fraction part)
    while (is_ascii_digit(current_char()) || at("_")) {
      advance()
    }
    while (
      (is_ascii_digit(current_char()) || current_char() === ".") &&
      current_char() !== "\0"
    ) {
      const c = advance()
      if (c === "." && !is_ascii_digit(current_char())) {
        break
      }
    }

    // Handle exponent part (e.g., 1e10, 1e+10, 1e-10)
    let has_exponent_part = false
    if (current_char() === "e" || current_char() === "E") {
      has_exponent_part = true
      advance()

      // Optional + or - after exponent indicator
      if (current_char() === "+" || current_char() === "-") {
        advance()
      }

      // Exponent must have at least one digit
      if (!is_ascii_digit(current_char())) {
        return error_token("Expected a digit after the exponent")
      }

      // Parse exponent digits
      while (is_ascii_digit(current_char()) && current_char() !== "\0") {
        advance()
      }
    }

    // Handle BigInt suffix 'n'
    if (current_char() === "n") {
      advance()
    }

    const text = current_text()

    // Validate: no leading zeros
    const first_char = text.charAt(0)
    const second_char = text.charAt(1)
    if (first_char === "0" && second_char >= "0" && second_char <= "9") {
      return error_token(
        "Invalid number literal: leading 0s are not allowed; If you want to use an octal literal, use a 0o prefix.",
      )
    }

    // Validate: BigInt cannot have decimal points
    if (text.endsWith("n") && text.includes(".")) {
      return error_token(
        "Invalid number literal: decimal points are not allowed in BigInt literals",
      )
    }

    // Validate: BigInt cannot have exponent part
    if (text.endsWith("n") && has_exponent_part) {
      return error_token(
        "Invalid number literal: BigInt literals cannot have an exponent part",
      )
    }

    return make_token(TokenKind.Number)
  }
  function lex_hex_number(): Token {
    assert(current_char() === "0", "Expected '0' at the start of a hex number")
    assert(
      next_char() === "x" || next_char() === "X",
      "Expected 'x' or 'X' after '0'",
    )

    advance() // Consume '0'
    advance() // Consume 'x' or 'X'

    if (!is_hex_digit(current_char())) {
      return error_token("Expected a hex character")
    }

    while (is_hex_digit(current_char()) && current_char() !== "\0") {
      advance()
    }

    // Handle optional BigInt suffix
    if (current_char() === "n") {
      advance()
    }

    return make_token(TokenKind.Number)
  }

  function lex_octal_number(): Token {
    assert(
      current_char() === "0",
      "Expected '0' at the start of an octal number",
    )
    assert(
      next_char() === "o" || next_char() === "O",
      "Expected 'o' or 'O' after '0'",
    )

    advance() // Consume '0'
    advance() // Consume 'o' or 'O'

    if (!is_octal_digit(current_char())) {
      return error_token("Expected an octal digit (0-7)")
    }

    while (is_octal_digit(current_char()) && current_char() !== "\0") {
      advance()
    }

    // Handle optional BigInt suffix
    if (current_char() === "n") {
      advance()
    }

    return make_token(TokenKind.Number)
  }

  function lex_binary_number(): Token {
    assert(
      current_char() === "0",
      "Expected '0' at the start of a binary number",
    )
    assert(
      next_char() === "b" || next_char() === "B",
      "Expected 'b' or 'B' after '0'",
    )

    advance() // Consume '0'
    advance() // Consume 'b' or 'B'

    if (!is_binary_digit(current_char())) {
      return error_token("Expected 0 or 1")
    }

    while (is_binary_digit(current_char()) && current_char() !== "\0") {
      advance()
    }

    // Handle optional BigInt suffix
    if (current_char() === "n") {
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
            `Invalid escape sequence: ${current_char()} at line ${self.line}`,
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
        `Unclosed string literal, expected ${quote} at line ${self.line}`,
      )
    }

    return make_token(TokenKind.String)
  }
  function error_token(message: string): Token {
    return {
      kind: TokenKind.Error,
      span: { start: self.span_start, stop: self.current_index },
      line: self.line,
      text: message,
      leading_trivia: "",
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
          self.template_literal_interpolation = true
          return make_token(TokenKind.TemplateLiteralFragment)
        } else {
          advance()
        }
      } else if (current === "\0") {
        return error_token("Unclosed template literal")
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
          self.template_literal_interpolation = true
          return make_token(TokenKind.TemplateLiteralFragment)
        } else {
          advance()
        }
      } else if (current === "\0") {
        throw new Error(
          `Unclosed template literal at line ${self.line}, expected \``,
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
      const start_offset = self.current_index
      let end_offset = start_offset

      while (current_char() !== "}" && current_char() !== "\0") {
        const c = advance()
        if (!is_hex_digit(c)) {
          return `Expected a hex character but got '${c}'`
        } else {
          end_offset = self.current_index
        }
      }

      const hex_string = self.input.slice(start_offset, end_offset)
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
  function lex_regex(): Token {
    assert(current_char() === "/", "Expected '/' at the start of a regex")
    advance()

    while (current_char() !== "/" && current_char() !== "\0") {
      if (is_line_terminator(current_char())) {
        return error_token("Unexpected newline in regex")
      }

      const c = advance()

      if (c === "\\") {
        const c = current_char()
        // Any character except for a linebreak is a valid escape character
        // in a regex literal
        // https://tc39.es/ecma262/#prod-RegularExpressionBackslashSequence
        if (is_line_terminator(c) || c === "\0") {
          return error_token("Unexpected newline in regex")
        } else {
          advance()
        }
      }
    }

    if (current_char() === "/") {
      advance()

      // Parse regex flags
      while (is_valid_regex_flag(current_char())) {
        advance()
      }

      return make_token(TokenKind.Regex)
    } else {
      return error_token(`Unclosed regular expression: expected /`)
    }
  }

  function lex_decorator_ident(): Token {
    assert(current_char() === "@", "Expected '@' at the start of a decorator")
    advance()

    if (!is_identifier_start(current_char())) {
      return error_token("Expected identifier after '@'")
    }

    while (is_identifier_char(current_char())) {
      advance()
    }

    return make_token(TokenKind.DecoratorIdent)
  }

  function lex_ident_or_keyword(): Token {
    advance()
    while (is_identifier_char(current_char())) {
      advance()
    }
    const token_kind = TokenKind.keyword_kind(current_text()) ?? TokenKind.Ident
    return make_token(token_kind)
  }
  function current_text() {
    return self.input.slice(self.span_start, self.current_index)
  }

  function make_token(kind: TokenKind): Token {
    assert(typeof kind === "string", "Expected kind to be a string")
    return {
      kind,
      span: { start: self.span_start, stop: self.current_index },
      line: self.line,
      text:
        kind === TokenKind.Ident ||
        kind === TokenKind.String ||
        kind === TokenKind.Number ||
        kind === TokenKind.TemplateLiteralFragment ||
        kind === TokenKind.DecoratorIdent ||
        kind === TokenKind.Regex
          ? current_text()
          : "",
      leading_trivia: self.leading_trivia,
    }
  }
  function current_char(): string {
    return self.input[self.current_index] ?? "\0"
  }
  function next_char(): string {
    return self.input[self.current_index + 1] ?? "\0"
  }
}

function is_whitespace(c: string): boolean {
  return (
    c === " " ||
    c === "\t" ||
    c === "\n" ||
    c === "\r" ||
    /* non-breaking space */
    c.charCodeAt(0) === 0xa0
  )
}
function is_ascii_digit(c: string): boolean {
  return c >= "0" && c <= "9"
}
function is_alphabet(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")
}
function is_identifier_start(c: string): boolean {
  return is_alphabet(c) || c === "_" || c === "$" || c === "#"
}

function is_identifier_char(c: string): boolean {
  return is_alphabet(c) || c === "_" || c === "$" || is_ascii_digit(c)
}

function is_hex_digit(c: string): boolean {
  return (
    (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")
  )
}

function is_line_terminator(c: string): boolean {
  return c === "\n" || c === "\r"
}

function is_valid_regex_flag(c: string): boolean {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags
  return ["d", "g", "i", "m", "s", "u", "v", "y"].includes(c)
}

function is_octal_digit(c: string): boolean {
  return c >= "0" && c <= "7"
}

function is_binary_digit(c: string): boolean {
  return c === "0" || c === "1"
}
