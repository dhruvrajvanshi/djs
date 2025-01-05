use std::str::CharIndices;

use djs_syntax::Span;

use crate::token::{Token, TokenKind};

#[derive(Clone)]
pub struct Lexer<'src> {
    source: &'src str,
    input: CharIndices<'src>,
}

impl<'src> Lexer<'src> {
    pub fn new(input: &'src str) -> Self {
        Lexer {
            source: input,
            input: input.char_indices(),
        }
    }

    pub fn next_token(&mut self) -> Token<'src> {
        self.skip_whitespace();
        let start_offset = self.current_offset();
        match self.current_char() {
            EOF_CHAR => Token {
                kind: TokenKind::EndOfFile,
                span: Span {
                    start: start_offset,
                    end: self.current_offset(),
                },
                text: "",
            },
            '{' => self.lex_single_char_token(TokenKind::LBrace),
            '}' => self.lex_single_char_token(TokenKind::RBrace),
            '(' => self.lex_single_char_token(TokenKind::LParen),
            ')' => self.lex_single_char_token(TokenKind::RParen),
            '=' => {
                self.advance();
                if self.current_char() == '>' {
                    self.advance();
                    Token {
                        kind: TokenKind::FatArrow,
                        span: Span {
                            start: start_offset,
                            end: self.current_offset(),
                        },
                        text: "=>",
                    }
                } else {
                    todo!()
                }
            }
            _ => {
                if is_identifier_start(self.current_char()) {
                    return self.lex_identifier();
                }
                todo!()
            }
        }
    }
    fn lex_single_char_token(&mut self, kind: TokenKind) -> Token<'src> {
        let start = self.current_offset();
        self.advance();
        Token {
            kind,
            span: Span {
                start,
                end: self.current_offset(),
            },
            text: &self.source[start as usize..self.current_offset() as usize],
        }
    }

    fn skip_whitespace(&mut self) {
        while self.current_char().is_whitespace() {
            self.advance();
        }
    }

    fn lex_identifier(&mut self) -> Token<'src> {
        let start = self.current_offset();
        while is_identifier_char(self.current_char()) {
            self.advance();
        }
        let span = Span {
            start,
            end: self.current_offset(),
        };
        Token {
            kind: TokenKind::Ident,
            span,
            text: &self.source[span.start()..span.end()],
        }
    }

    fn advance(&mut self) -> char {
        match self.input.next() {
            Some((offset, c)) => {
                assert!(
                    offset <= u32::MAX as usize,
                    "The lexer only supports files up to 4GB"
                );
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
        assert_eq!(lexer.next_token().kind, TokenKind::EndOfFile);
    }

    #[test]
    fn test_lexes_identifier() {
        let mut lexer = Lexer::new("a");
        let tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a");
    }

    #[test]
    fn skips_whitespace_before_identifier() {
        let mut lexer = Lexer::new("  a");
        let tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a");

        assert_eq!(lexer.next_token().kind, TokenKind::EndOfFile);
    }

    #[test]
    fn test_lexes_identifier_with_underscores() {
        let mut lexer = Lexer::new("a_b_c");
        let tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::Ident);
        assert_eq!(tok.text, "a_b_c");
    }

    #[test]
    fn lexes_single_char_tokens() {
        let mut lexer = Lexer::new("{}()");
        let mut tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::LBrace);
        assert_eq!(tok.text, "{");

        tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::RBrace);
        assert_eq!(tok.text, "}");

        tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::LParen);
        assert_eq!(tok.text, "(");

        tok = lexer.next_token();
        assert_eq!(tok.kind, TokenKind::RParen);
        assert_eq!(tok.text, ")");
    }
}
