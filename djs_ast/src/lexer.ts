import { TokenKind } from "./TokenKind.js"
import { Token } from "./Token.js"

export interface Lexer {
  clone(): Lexer
  next(): Token
}
export function Lexer(input: string) {
  return lexer_impl(
    input,
    /* line */ 1,
    /* start_index */ 0,
    /* regex_enabled */ false,
  )
}

export function lexer_impl(
  input: string,
  _line: number,
  _index: number,
  _regex_enabled: boolean,
): Lexer {
  let line = _line
  let span_start = _index
  let current_index = _index
  let regex_enabled = _regex_enabled
  return {
    clone(): Lexer {
      return lexer_impl(input, line, current_index, regex_enabled)
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
    consume_whitespace()
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

    // '`' => self.lex_template_literal_start(),

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
  function lex_number(): Token {
    while (is_ascii_digit(current_char())) {
      advance()
    }
    return make_token(TokenKind.Number)
  }

  function lex_ident_or_keyword(): Token {
    while (is_identifier_char(current_char())) {
      advance()
    }
    const token_kind = TokenKind.from_str(current_text()) ?? TokenKind.Ident
    return make_token(token_kind)
  }
  function current_text() {
    return input.slice(span_start, current_index)
  }

  function make_token(kind: TokenKind): Token {
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
  function current_char() {
    return input[current_index] ?? "\0"
  }

  function consume_whitespace() {
    while (is_whitespace(current_char())) {
      advance()
    }
  }

  function advance() {
    if (current_index >= input.length) {
      throw new Error("End of input")
    }
    let last_char = input[current_index]
    current_index++
    if (last_char === "\n") {
      line++
    }
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
