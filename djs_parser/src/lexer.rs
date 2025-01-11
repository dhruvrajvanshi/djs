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
        self.skip_whitespace();
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
            '=' => {
                self.advance();
                if self.current_char() == '>' {
                    self.advance();
                    Ok(self.make_token(TokenKind::FatArrow))
                } else {
                    Ok(self.make_token(TokenKind::Eq))
                }
            }
            c => {
                if is_identifier_start(self.current_char()) {
                    Ok(self.lex_identifier())
                } else {
                    Err(Error::UnexpectedCharacter(c))
                }
            }
        }
    }

    fn make_token(&self, kind: TokenKind) -> Token<'src> {
        let start_index = self.start_offset as usize;
        let end_index = self.current_offset() as usize;
        Token {
            kind,
            span: Span {
                start: self.current_offset(),
                end: self.current_offset(),
            },
            line: self.line,
            text: &self.source[start_index..end_index],
        }
    }

    fn lex_single_char_token(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        self.advance();
        Ok(self.make_token(kind))
    }

    fn skip_whitespace(&mut self) {
        while self.current_char().is_whitespace() {
            self.advance();
        }
    }

    fn lex_identifier(&mut self) -> Token<'src> {
        while is_identifier_char(self.current_char()) {
            self.advance();
        }
        self.make_token(TokenKind::Ident)
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
    use crate::{lexer::Lexer, token::TokenKind};

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
}
