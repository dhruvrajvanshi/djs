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
    UnexpectedCharacter(char),
    UnexpectedEOF(/* expected? */ char),
    InvalidEscape(char),
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
            '"' | '\'' => self.lex_simple_string(),
            '=' => {
                self.advance();
                if self.current_char() == '>' {
                    self.advance();
                    Ok(self.make_token(TokenKind::FatArrow))
                } else {
                    Ok(self.make_token(TokenKind::Eq))
                }
            }
            c if is_identifier_start(c) => Ok(self.lex_ident_or_keyword()),
            c if c.is_numeric() => self.lex_number(),
            c => Err(Error::UnexpectedCharacter(c)),
        }
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
                if !matches!(self.current_char(), '\\' | 'n' | 't' | '\'' | '"') {
                    return Err(Error::InvalidEscape(self.current_char()));
                } else {
                    self.advance();
                }
            }
        }
        let end_quote = self.advance();
        if end_quote != quote {
            Err(Error::UnexpectedEOF(quote))
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
                    return Err(Error::UnexpectedEOF('*'));
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
        let token_kind = match self.current_text() {
            "let" => TokenKind::Let,
            "var" => TokenKind::Var,
            "const" => TokenKind::Const,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            _ => TokenKind::Ident,
        };
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
    c.is_alphabetic() || c == '_'
}

fn is_identifier_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
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
        let mut token = lexer.next_token().unwrap();
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
}
