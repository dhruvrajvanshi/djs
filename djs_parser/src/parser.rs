use std::mem;

use djs_ast::{Expr, ExprKind, ExprOrBlock, Param, ParamList};
use djs_syntax::Span;

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
                let mut snapshot1 = self.clone();
                let mut snapshot2 = self.clone();
                let paren_expr = snapshot1.parse_paren_expr();
                let arrow_fn = snapshot2.parse_arrow_fn();
                match (paren_expr, arrow_fn) {
                    (_, Ok(expr)) => {
                        self.commit(snapshot2);
                        Ok(expr)
                    }
                    (Ok(expr), Err(..)) => {
                        self.commit(snapshot1);
                        Ok(expr)
                    }

                    _ => Err(ParseError::UnexpectedToken),
                }
            }
            _ => Err(ParseError::UnexpectedToken),
        }
    }

    fn parse_paren_expr(&mut self) -> Result<Expr<'src>> {
        self.expect(T::LParen)?;
        let expr = self.parse_expr()?;
        self.expect(T::RParen)?;
        Ok(expr)
    }

    fn parse_arrow_fn(&mut self) -> Result<Expr<'src>> {
        let params = self.parse_param_list()?;
        self.expect(T::FatArrow)?;
        let body = self.parse_expr_or_block()?;

        Ok(Expr {
            span: Span::between(params.span, body.span()),
            kind: ExprKind::ArrowFn(params, body),
        })
    }

    fn parse_expr_or_block(&mut self) -> Result<ExprOrBlock<'src>> {
        match self.current_token.kind {
            T::LBrace => {
                todo!()
            }
            _ => Ok(ExprOrBlock::Expr(Box::new(self.parse_expr()?))),
        }
    }

    fn parse_param_list(&mut self) -> Result<ParamList<'src>> {
        let start = self.expect(T::LParen)?;
        let mut params = Vec::new();
        loop {
            match self.current_token.kind {
                T::Ident => {
                    let tok = self.advance();
                    params.push(Param {
                        span: tok.span,
                        name: tok.text,
                    });
                }
                T::RParen => break,
                _ => return Err(ParseError::UnexpectedToken),
            }
        }
        let stop = self.expect(T::RParen)?;
        Ok(ParamList {
            span: Span {
                start: start.span.start,
                end: stop.span.end,
            },
            params,
        })
    }

    fn clone(&self) -> Self {
        Self {
            lexer: self.lexer.clone(),
            current_token: self.current_token,
        }
    }

    fn commit(&mut self, snapshot: Self) {
        self.lexer = snapshot.lexer;
        self.current_token = snapshot.current_token;
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

    #[test]
    fn should_parse_arrow_fn() {
        let source = "(x) => x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr.kind, ExprKind::ArrowFn(..)));
    }
}
