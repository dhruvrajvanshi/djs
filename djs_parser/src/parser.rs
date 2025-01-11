use std::mem;

use djs_ast::{ArrowFnBody, Block, Expr, Param, ParamList, SourceFile, Stmt};
use djs_syntax::Span;

use crate::{
    lexer::{self, Lexer},
    token::{Token, TokenKind},
};

#[derive(Clone)]
pub struct Parser<'src> {
    lexer: Lexer<'src>,
    last_token: Option<Token<'src>>,
    current_token: lexer::Result<Token<'src>>,
}
pub type Result<T> = std::result::Result<T, Error>;

type T = TokenKind;

#[derive(Debug)]
pub enum Error {
    UnexpectedToken,
    UnexpectedEOF,
    MissingSemi,
    Lexer(lexer::Error),
}

impl<'src> Parser<'src> {
    pub fn new(source: &'src str) -> Self {
        let mut lexer = Lexer::new(source);
        let current_token = lexer.next_token();
        Parser {
            last_token: None,
            lexer,
            current_token,
        }
    }

    pub fn current(&self) -> Result<&Token<'src>> {
        self.current_token.as_ref().map_err(|e| Error::Lexer(*e))
    }

    pub fn parse_source_file(&mut self) -> Result<SourceFile<'src>> {
        let mut stmts = Vec::new();
        let start = self.current()?.span;
        while self.current()?.kind != T::EndOfFile {
            let stmt = self.parse_stmt()?;
            stmts.push(stmt);
        }
        let stop = self.current()?.span;
        Ok(SourceFile {
            span: Span::between(start, stop),
            stmts,
        })
    }

    fn parse_stmt(&mut self) -> Result<Stmt<'src>> {
        self.parse_expr_stmt()
    }

    fn parse_expr_stmt(&mut self) -> Result<Stmt<'src>> {
        let expr = self.parse_expr()?;
        self.expect_semi()?;
        Ok(Stmt::Expr(expr.span(), Box::new(expr)))
    }

    fn expect_semi(&mut self) -> Result<()> {
        // TODO: Handle ASI
        if self.current()?.kind == T::Semi {
            self.advance()?;
            return Ok(());
        }
        if matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
            return Ok(());
        }
        if self.current()?.line
            > self
                .last_token
                .expect("expect_semi must be called after consuming at least 1 token")
                .line
        {
            return Ok(());
        }
        Err(Error::MissingSemi)
    }

    pub(super) fn parse_primary_expr(&mut self) -> Result<Expr<'src>> {
        match self.current()?.kind {
            T::Ident => {
                let tok = self.advance()?;
                Ok(Expr::Var(tok.span, tok.text))
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

                    _ => Err(Error::UnexpectedToken),
                }
            }
            _ => Err(Error::UnexpectedToken),
        }
    }

    fn parse_paren_expr(&mut self) -> Result<Expr<'src>> {
        self.expect(T::LParen)?;
        let expr = self.parse_expr()?;
        self.expect(T::RParen)?;
        Ok(expr)
    }

    fn parse_expr(&mut self) -> Result<Expr<'src>> {
        let lhs = self.parse_member_expr_or_higher()?;
        self.parse_call_expr_tail(lhs)
    }

    fn parse_member_expr_or_higher(&mut self) -> Result<Expr<'src>> {
        let lhs = self.parse_primary_expr()?;
        self.parse_member_expr_tail(lhs)
    }

    fn parse_member_expr_tail(&mut self, lhs: Expr<'src>) -> Result<Expr<'src>> {
        match self.current()?.kind {
            T::LSquare => {
                self.advance()?;
                let prop = self.parse_expr()?;
                self.expect(T::RSquare)?;
                let span = Span::between(lhs.span(), prop.span());
                let member_expr = Expr::Member(span, Box::new(lhs), Box::new(prop));
                self.parse_member_expr_tail(member_expr)
            }
            _ => Ok(lhs),
        }
    }

    fn parse_call_expr_tail(&mut self, lhs: Expr<'src>) -> Result<Expr<'src>> {
        match self.current()?.kind {
            T::LParen => {
                self.advance()?;
                let args = self.parse_arg_list()?;
                let end_tok = self.expect(T::RParen)?;
                let span = Span::between(lhs.span(), end_tok.span);
                let call_expr = Expr::Call(span, Box::new(lhs), args);
                self.parse_call_expr_tail(call_expr)
            }
            _ => Ok(lhs),
        }
    }
    fn parse_arg_list(&mut self) -> Result<Vec<Expr<'src>>> {
        let mut args = Vec::new();
        loop {
            if matches!(self.current()?.kind, T::RParen | T::EndOfFile) {
                break;
            }
            args.push(self.parse_expr()?);
            if self.current()?.kind == T::Comma {
                self.advance()?;
            }
        }
        Ok(args)
    }

    fn parse_arrow_fn(&mut self) -> Result<Expr<'src>> {
        let params = self.parse_param_list()?;
        self.expect(T::FatArrow)?;
        let body = self.parse_expr_or_block()?;

        Ok(Expr::ArrowFn(
            Span::between(params.span, body.span()),
            params,
            body,
        ))
    }

    fn parse_expr_or_block(&mut self) -> Result<ArrowFnBody<'src>> {
        match self.current()?.kind {
            T::LBrace => {
                let start = self.advance()?;
                let mut stmts = vec![];
                while !matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
                    let stmt = self.parse_stmt()?;
                    stmts.push(stmt);
                }
                let stop = self.expect(T::RBrace)?;
                Ok(ArrowFnBody::Block(Block {
                    span: Span::between(start.span, stop.span),
                    stmts,
                }))
            }
            _ => Ok(ArrowFnBody::Expr(Box::new(self.parse_expr()?))),
        }
    }

    fn parse_param_list(&mut self) -> Result<ParamList<'src>> {
        let start = self.expect(T::LParen)?;
        let mut params = Vec::new();
        loop {
            match self.current()?.kind {
                T::Ident => {
                    let tok = self.advance()?;
                    params.push(Param {
                        span: tok.span,
                        name: tok.text,
                    });
                }
                T::RParen => break,
                _ => return Err(Error::UnexpectedToken),
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

    fn commit(&mut self, snapshot: Self) {
        *self = snapshot;
    }

    fn advance(&mut self) -> Result<Token<'src>> {
        let last_token = mem::replace(&mut self.current_token, self.lexer.next_token())?;
        self.last_token = Some(last_token);
        Ok(last_token)
    }
    fn expect(&mut self, kind: TokenKind) -> Result<Token<'src>> {
        if self.current()?.kind == kind {
            Ok(self.advance()?)
        } else {
            Err(Error::UnexpectedToken)
        }
    }
}
impl From<lexer::Error> for Error {
    fn from(e: lexer::Error) -> Self {
        Error::Lexer(e)
    }
}

#[cfg(test)]
mod tests {
    use djs_ast::Expr;

    use super::*;

    #[test]
    fn test_parse_var_expr() {
        let source = "x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(_, "x")));
    }

    #[test]
    fn should_parse_parenthesized_expr() {
        let source = "(x)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(_, "x")));
    }

    #[test]
    fn should_parse_arrow_fn() {
        let source = "(x) => x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::ArrowFn(..)));
    }

    #[test]
    fn auto_inserts_semicolon_when_the_next_statement_is_on_a_new_line() {
        let source = "
            x
            y
        ";
        let mut parser = Parser::new(source);
        let source_file = parser.parse_source_file().unwrap();

        assert!(source_file.stmts.len() == 2);

        let Stmt::Expr(_, x) = &source_file.stmts[0] else {
            panic!("Expected an expression statement")
        };
        let Expr::Var(_, "x") = **x else {
            panic!("Expected a variable expression")
        };
        let Stmt::Expr(_, y) = &source_file.stmts[1] else {
            panic!("Expected an expression statement")
        };
        let Expr::Var(_, "y") = **y else {
            panic!("Expected a variable expression")
        };
    }

    #[test]
    fn parses_function_calls() {
        let source = "f(x, y, z)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        match &expr {
            Expr::Call(_, f, args) => {
                assert!(matches!(**f, Expr::Var(_, "f")));
                assert!(matches!(
                    args.as_slice(),
                    [Expr::Var(_, "x"), Expr::Var(_, "y"), Expr::Var(_, "z")]
                ));
            }
            _ => panic!("Expected a call expression"),
        }
    }

    #[test]
    fn parses_chained_member_call() {
        let source = "a[b][c]()(d, e)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        use Expr::*;
        let Call(_, outer_callee, args) = expr else {
            panic!("Expected a call expression")
        };
        assert!(matches!(args.as_slice(), [Var(_, "d"), Var(_, "e")]));
        assert!(matches!(*outer_callee, Call(..)));
        let Call(_, inner_callee, args) = *outer_callee else {
            panic!("Expected a call expression")
        };
        assert!(matches!(args.as_slice(), []));
        let Member(_, obj, c) = *inner_callee else {
            panic!("Expected a member expression")
        };
        assert!(matches!(*c, Var(_, "c")));
        let Member(_, obj, b) = *obj else {
            panic!("Expected a member expression")
        };
        assert!(matches!(*b, Var(_, "b")));
        assert!(matches!(*obj, Var(_, "a")));
    }

    #[test]
    fn parses_arrow_fn_with_block_body() {
        let source = "() => { x; y }";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        let Expr::ArrowFn(_, _, ArrowFnBody::Block(block)) = expr else {
            panic!("Expected an arrow fn expression")
        };
        let [Stmt::Expr(_, first_stmt), Stmt::Expr(_, second_stmt)] = block.stmts.as_slice() else {
            panic!("Expected 2 statements in the block")
        };
        assert!(matches!(**first_stmt, Expr::Var(_, "x")));
        assert!(matches!(**second_stmt, Expr::Var(_, "y")));
    }
}
