use std::mem;

use djs_ast::{Expr, ExprKind};

use crate::{
    lexer::Lexer,
    token::{Token, TokenKind},
};

struct Parser<'src> {
    lexer: Lexer<'src>,
    current_token: Token<'src>,
}
pub type Result<T> = std::result::Result<T, ParseError>;

type T = TokenKind;

#[derive(Debug)]
pub enum ParseError {
    UnexpectedToken,
    UnexpectedEOF,
}

impl<'src> Parser<'src> {
    pub fn new(source: &'src str) -> Self {
        let mut lexer = Lexer::new(source);
        let current_token = lexer.next_token();
        Parser {
            lexer,
            current_token,
        }
    }

    pub(super) fn parse_expr(&mut self) -> Result<Expr<'src>> {
        match self.current_token.kind {
            T::Ident => {
                let tok = self.advance();
                Ok(Expr {
                    span: tok.span,
                    kind: ExprKind::Var(tok.text),
                })
            }
            T::LParen => {
                self.advance();
                let inner = self.parse_expr()?;
                self.expect(T::RParen)?;
                Ok(inner)
            }
            _ => Err(ParseError::UnexpectedToken),
        }
    }

    fn advance(&mut self) -> Token<'src> {
        mem::replace(&mut self.current_token, self.lexer.next_token())
    }
    fn expect(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        if self.current_token.kind == kind {
            Ok(self.advance())
        } else {
            Err(ParseError::UnexpectedToken)
        }
    }
}

#[cfg(test)]
mod tests {
    use djs_ast::ExprKind;

    use super::*;

    #[test]
    fn test_parse_var_expr() {
        let source = "x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr.kind, ExprKind::Var("x")));
    }

    #[test]
    fn should_parse_parenthesized_expr() {
        let source = "(x)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr.kind, ExprKind::Var("x")));
    }
}
