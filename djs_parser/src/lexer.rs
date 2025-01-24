use std::str::CharIndices;

use djs_syntax::Span;

use crate::token::{Token, TokenKind};

#[derive(Clone)]
pub struct Lexer<'src> {
    line: u32,
    source: &'src str,
    start_offset: u32,
    input: CharIndices<'src>,
}
#[derive(Debug, Clone, Copy)]
pub enum Error {
    UnexpectedCharacter(u32, char),
    UnexpectedEOF(u32, /* expected? */ char),
    InvalidEscape(u32, char),
    ExpectedAHexChar(u32, char),
}
impl Error {
    pub fn line(&self) -> u32 {
        match self {
            Error::UnexpectedCharacter(line, _) => *line,
            Error::UnexpectedEOF(line, _) => *line,
            Error::InvalidEscape(line, _) => *line,
            Error::ExpectedAHexChar(line, _) => *line,
        }
    }
}
pub type Result<T> = std::result::Result<T, Error>;

impl<'src> Lexer<'src> {
    pub fn new(input: &'src str) -> Self {
        Lexer {
            line: 1,
            start_offset: 0,
            source: input,
            input: input.char_indices(),
        }
    }

    pub fn next_token(&mut self) -> Result<Token<'src>> {
        self.skip_whitespace_and_comments()?;
        self.start_offset = self.current_offset();
        macro_rules! at {
            ($expected:expr) => {
                self.at($expected)
            };
        }
        match self.current_char() {
            EOF_CHAR => Ok(self.make_token(TokenKind::EndOfFile)),
            '{' => self.lex_single_char_token(TokenKind::LBrace),
            '}' => self.lex_single_char_token(TokenKind::RBrace),
            '(' => self.lex_single_char_token(TokenKind::LParen),
            ')' => self.lex_single_char_token(TokenKind::RParen),
            ';' => self.lex_single_char_token(TokenKind::Semi),
            '[' => self.lex_single_char_token(TokenKind::LSquare),
            ']' => self.lex_single_char_token(TokenKind::RSquare),
            ',' => self.lex_single_char_token(TokenKind::Comma),
            ':' => self.lex_single_char_token(TokenKind::Colon),
            _ if at!("...") => self.lex_3_char_token(TokenKind::DotDotDot),
            '.' => self.lex_single_char_token(TokenKind::Dot),

            _ if at!("&&=") => self.lex_3_char_token(TokenKind::AmpAmpEq),
            _ if at!("||=") => self.lex_3_char_token(TokenKind::BarBarEq),
            _ if at!("??=") => self.lex_3_char_token(TokenKind::QuestionQuestionEq),
            _ if at!("*=") => self.lex_2_char_token(TokenKind::StarEq),
            _ if at!("/=") => self.lex_2_char_token(TokenKind::SlashEq),
            _ if at!("%=") => self.lex_2_char_token(TokenKind::PercentEq),
            _ if at!("+=") => self.lex_2_char_token(TokenKind::PlusEq),
            _ if at!("-=") => self.lex_2_char_token(TokenKind::MinusEq),
            _ if at!("<<=") => self.lex_3_char_token(TokenKind::LessThanLessThanEq),
            _ if at!(">>=") => self.lex_3_char_token(TokenKind::GreaterThanGreaterThanEq),
            _ if at!(">>>=") => {
                self.lex_3_char_token(TokenKind::GreaterThanGreaterThanGreaterThanEq)
            }
            _ if at!("&=") => self.lex_2_char_token(TokenKind::AmpEq),
            _ if at!("^=") => self.lex_2_char_token(TokenKind::CaretEq),
            _ if at!("|=") => self.lex_2_char_token(TokenKind::BarEq),
            _ if at!("**=") => self.lex_3_char_token(TokenKind::StarStarEq),
            '*' => self.lex_single_char_token(TokenKind::Star),
            '~' => self.lex_single_char_token(TokenKind::Tilde),
            '/' => {
                let mut snapshot = self.clone();
                match snapshot.try_lex_regex() {
                    Some(token) => {
                        *self = snapshot;
                        Ok(token)
                    }
                    None => self.lex_single_char_token(TokenKind::Slash),
                }
            }
            '?' => self.lex_single_char_token(TokenKind::Question),
            '"' | '\'' => self.lex_simple_string(),

            _ if at!("<=") => self.lex_2_char_token(TokenKind::LessThanEq),
            '<' => self.lex_single_char_token(TokenKind::LessThan),

            _ if at!(">=") => self.lex_2_char_token(TokenKind::GreaterThanEq),
            '>' => self.lex_single_char_token(TokenKind::GreaterThan),

            _ if at!("!==") => self.lex_3_char_token(TokenKind::BangEqEq),
            _ if at!("!=") => self.lex_2_char_token(TokenKind::BangEq),
            '!' => self.lex_single_char_token(TokenKind::Bang),

            _ if at!("===") => self.lex_3_char_token(TokenKind::EqEqEq),
            _ if at!("==") => self.lex_2_char_token(TokenKind::EqEq),
            _ if at!("=>") => self.lex_2_char_token(TokenKind::FatArrow),
            '=' => self.lex_single_char_token(TokenKind::Eq),

            _ if at!("++") => self.lex_2_char_token(TokenKind::PlusPlus),
            '+' => self.lex_single_char_token(TokenKind::Plus),

            _ if at!("--") => self.lex_2_char_token(TokenKind::MinusMinus),
            '-' => self.lex_single_char_token(TokenKind::Minus),

            _ if at!("&&") => self.lex_2_char_token(TokenKind::AmpAmp),
            '&' => self.lex_single_char_token(TokenKind::Amp),

            _ if at!("||") => self.lex_2_char_token(TokenKind::VBarVBar),
            '|' => self.lex_single_char_token(TokenKind::VBar),

            '^' => self.lex_single_char_token(TokenKind::Caret),

            c if is_identifier_start(c) => Ok(self.lex_ident_or_keyword()),
            c if c.is_numeric() => self.lex_number(),
            c => Err(Error::UnexpectedCharacter(self.line, c)),
        }
    }

    fn try_lex_regex(&mut self) -> Option<Token<'src>> {
        assert!(self.current_char() == '/');
        self.advance();

        while self.current_char() != '/' && self.current_char() != EOF_CHAR {
            if is_line_terminator(self.current_char()) {
                return None;
            }
            let c = self.advance();
            if c == '\\' {
                self.advance();
                // Any character except for a linebreak is a valid escape character
                // in a regex literal
                // https://tc39.es/ecma262/#prod-RegularExpressionBackslashSequence
                if is_line_terminator(self.current_char()) || self.current_char() == EOF_CHAR {
                    return None;
                } else {
                    self.advance();
                }
            }
        }
        if self.current_char() == '/' {
            self.advance();
            while is_valid_regex_flag(self.current_char()) {
                self.advance();
            }
            Some(self.make_token(TokenKind::Regex))
        } else {
            None
        }
    }

    fn at(&self, expected: &str) -> bool {
        let mut clone = self.clone();
        for expected in expected.chars() {
            if clone.current_char() != expected {
                return false;
            }
            clone.advance();
        }
        true
    }

    fn lex_2_char_token(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        self.advance();
        self.advance();
        Ok(self.make_token(kind))
    }

    fn lex_3_char_token(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        self.advance();
        self.advance();
        self.advance();
        Ok(self.make_token(kind))
    }

    fn lex_number(&mut self) -> Result<Token<'src>> {
        let start = self.advance();
        assert!(start.is_numeric());
        while (self.current_char().is_numeric() || self.current_char() == '.') && !self.eof() {
            self.advance();
        }
        Ok(self.make_token(TokenKind::Number))
    }

    fn eof(&self) -> bool {
        self.current_char() == EOF_CHAR
    }

    fn lex_simple_string(&mut self) -> Result<Token<'src>> {
        assert!(matches!(self.current_char(), '"' | '\''));
        let quote = self.advance();
        while self.current_char() != EOF_CHAR && self.current_char() != quote {
            let c = self.advance();
            if c == '\\' {
                if self.current_char() == 'u' {
                    // https://tc39.es/ecma262/#prod-UnicodeEscapeSequence
                    self.advance();
                    if self.current_char() == '{' {
                        while !matches!(self.current_char(), '}' | EOF_CHAR) {
                            let c = self.advance();
                            if !c.is_ascii_hexdigit() {
                                return Err(Error::ExpectedAHexChar(self.line, c));
                            }
                        }
                    } else {
                        for _ in 0..4 {
                            let c = self.advance();
                            if !c.is_ascii_hexdigit() {
                                return Err(Error::ExpectedAHexChar(self.line, c));
                            }
                        }
                    }
                } else if !matches!(
                    self.current_char(),
                    // https://tc39.es/ecma262/#prod-SingleEscapeCharacter
                    '\\' | 'b' | 'f' | 'n' | 'r' | 't' | 'v' | '\'' | '"' | '\n'
                ) {
                    return Err(Error::InvalidEscape(self.line, self.current_char()));
                } else {
                    self.advance();
                }
            }
        }
        let end_quote = self.advance();
        if end_quote != quote {
            Err(Error::UnexpectedEOF(self.line, quote))
        } else {
            Ok(self.make_token(TokenKind::String))
        }
    }

    fn make_token(&self, kind: TokenKind) -> Token<'src> {
        Token {
            kind,
            span: Span {
                start: self.current_offset(),
                end: self.current_offset(),
            },
            line: self.line,
            text: self.current_text(),
        }
    }

    fn current_text(&self) -> &'src str {
        let start_index = self.start_offset as usize;
        let end_index = self.current_offset() as usize;
        &self.source[start_index..end_index]
    }

    fn lex_single_char_token(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        self.advance();
        Ok(self.make_token(kind))
    }

    fn skip_whitespace_and_comments(&mut self) -> Result<()> {
        while self.current_char().is_whitespace() || self.at_comment() {
            if self.current_char().is_whitespace() {
                self.skip_whitespace();
            } else {
                self.skip_comment()?;
            }
        }
        Ok(())
    }

    fn skip_comment(&mut self) -> Result<()> {
        let first = self.advance();
        assert_eq!(first, '/');
        let second = self.advance();
        assert!(second == '/' || second == '*');
        if second == '/' {
            while !matches!(self.current_char(), '\n' | EOF_CHAR) {
                self.advance();
            }
        } else {
            loop {
                let first = self.advance();
                if first == EOF_CHAR {
                    return Err(Error::UnexpectedEOF(self.line, '*'));
                }
                if first == '*' && self.current_char() == '/' {
                    self.advance();
                    break;
                }
            }
        }
        Ok(())
    }

    fn skip_whitespace(&mut self) {
        while self.current_char().is_whitespace() {
            self.advance();
        }
    }

    fn at_comment(&self) -> bool {
        (self.current_char() == '/' && self.next_char() == '/')
            || (self.current_char() == '/' && self.next_char() == '*')
    }

    fn lex_ident_or_keyword(&mut self) -> Token<'src> {
        while is_identifier_char(self.current_char()) {
            self.advance();
        }
        let token_kind = TokenKind::from_str(self.current_text()).unwrap_or(TokenKind::Ident);
        self.make_token(token_kind)
    }

    fn advance(&mut self) -> char {
        match self.input.next() {
            Some((offset, c)) => {
                assert!(
                    offset <= u32::MAX as usize,
                    "The lexer only supports files up to 4GB"
                );
                if c == '\n' {
                    self.line += 1;
                }
                c
            }
            None => EOF_CHAR,
        }
    }

    fn current_offset(&self) -> u32 {
        self.input
            .clone()
            .next()
            .map(|(offset, _)| offset as u32)
            .unwrap_or(self.source.len() as u32)
    }

    fn current_char(&self) -> char {
        self.input
            .clone()
            .next()
            .map(|(_, c)| c)
            .unwrap_or(EOF_CHAR)
    }

    fn next_char(&self) -> char {
        let mut iter = self.input.clone();
        iter.next();
        iter.next().map(|(_, c)| c).unwrap_or(EOF_CHAR)
    }
}
const EOF_CHAR: char = '\0';

fn is_identifier_start(c: char) -> bool {
    c.is_alphabetic() || c == '_' || c == '$'
}

fn is_identifier_char(c: char) -> bool {
    is_identifier_start(c) || c.is_numeric()
}

fn is_line_terminator(c: char) -> bool {
    c == '\n' || c == '\r'
}
fn is_valid_regex_flag(c: char) -> bool {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags
    matches!(c, 'd' | 'g' | 'i' | 'm' | 's' | 'u' | 'v' | 'y')
}

#[cfg(test)]
mod test {
    use crate::{
        lexer::Lexer,
        token::{Token, TokenKind},
    };

    #[test]
    fn test_lexes_empty_file() {
        let mut lexer = Lexer::new("");
        assert_eq!(lexer.next_token().unwrap().kind, TokenKind::EndOfFile);
    }

    #[test]
    fn test_lexes_identifier() {
        let mut lexer = Lexer::new("a");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a");
    }

    #[test]
    fn skips_whitespace_before_identifier() {
        let mut lexer = Lexer::new("  a");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a");

        assert_eq!(lexer.next_token().unwrap().kind, TokenKind::EndOfFile);
    }

    #[test]
    fn test_lexes_identifier_with_underscores() {
        let mut lexer = Lexer::new("a_b_c");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a_b_c");
    }

    #[test]
    fn lexes_single_char_tokens() {
        let mut lexer = Lexer::new("{}()");
        let mut tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::LBrace);
        assert_eq!(tok.text, "{");

        tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::RBrace);
        assert_eq!(tok.text, "}");

        tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::LParen);
        assert_eq!(tok.text, "(");

        tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::RParen);
        assert_eq!(tok.text, ")");
    }

    #[test]
    fn skips_comments() {
        let mut lexer = Lexer::new(
            "
            // foo
            x
            // foo
            y

            // foo

            /* bar
            */
            z
        ",
        );
        assert!(matches!(
            lexer.next_token().unwrap(),
            Token {
                kind: TokenKind::Ident,
                text: "x",
                ..
            }
        ));
        let mut token = lexer.next_token().unwrap();
        assert_eq!(token.kind, TokenKind::Ident);
        assert_eq!(token.text, "y");
        token = lexer.next_token().unwrap();
        assert_eq!(token.kind, TokenKind::Ident);
        assert_eq!(token.text, "z");
    }

    #[test]
    fn skips_block_comments() {
        let mut lexer = Lexer::new("/* foo */ x");
        let token = lexer.next_token().unwrap();
        assert_eq!(token.kind, TokenKind::Ident);
        assert_eq!(token.text, "x");
    }

    #[test]
    fn parses_strings_without_escapes() {
        let mut lexer = Lexer::new(
            "
          'foo bar'

          \"foo bar\"
        ",
        );
        let mut tok = lexer.next_token().unwrap();

        assert_eq!(tok.text, "'foo bar'");
        assert_eq!(tok.kind, TokenKind::String);

        tok = lexer.next_token().unwrap();
        assert_eq!(tok.text, "\"foo bar\"");
        assert_eq!(tok.kind, TokenKind::String);
    }

    #[test]
    fn parses_strings_with_escape() {
        let mut lexer = Lexer::new(
            "
          'foo \\' \\\\ \\n bar'
        ",
        );
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::String);
        assert_eq!(tok.text, "'foo \\' \\\\ \\n bar'")
    }

    #[test]
    fn lexes_eq_eq_eq() {
        let mut lexer = Lexer::new("===");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::EqEqEq);
    }

    #[test]
    fn lexes_eqeq() {
        let mut lexer = Lexer::new("== ");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::EqEq);
    }

    #[test]
    fn lexes_eq() {
        let mut lexer = Lexer::new("= ");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::Eq);
    }

    #[test]
    fn lexes_plus() {
        let mut lexer = Lexer::new("+ ");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::Plus);
    }

    #[test]
    fn lexes_plus_plus() {
        let mut lexer = Lexer::new("++ ");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::PlusPlus);
    }
    #[test]
    fn lexes_unicode_escape() {
        let mut lexer = Lexer::new("'\\u0041'");
        let tok = lexer.next_token().unwrap();
        assert_eq!(tok.kind, TokenKind::String);
    }
}
