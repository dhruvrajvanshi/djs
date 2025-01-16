use std::mem;

use djs_ast::{
    ArrowFnBody, Block, DeclType, Expr, Ident, ObjectLiteralEntry, Param, ParamList, Pattern,
    SourceFile, Stmt,
};
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
    UnexpectedToken(u32, Span, TokenKind),
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

    fn parse_block(&mut self) -> Result<Block<'src>> {
        let start = self.expect(T::LBrace)?.span;
        let mut stmts = Vec::new();
        while self.current()?.kind != T::RBrace {
            let stmt = self.parse_stmt()?;
            stmts.push(stmt);
        }
        let stop = self.expect(T::RBrace)?.span;
        Ok(Block {
            span: Span::between(start, stop),
            stmts,
        })
    }

    fn parse_stmt(&mut self) -> Result<Stmt<'src>> {
        match self.current()?.kind {
            T::Let | T::Const | T::Var => self.parse_var_decl(),
            T::If => self.parse_if_stmt(),
            _ => self.parse_expr_stmt(),
        }
    }

    fn parse_if_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::If)?.span;
        self.expect(T::LParen)?;
        let cond = self.parse_expr()?;
        self.expect(T::RParen)?;
        let then_branch = Box::new(self.parse_stmt()?);
        let else_branch = if self.current()?.kind == T::Else {
            self.advance()?;
            Some(Box::new(self.parse_stmt()?))
        } else {
            None
        };
        Ok(Stmt::If(
            Span::between(
                start,
                else_branch
                    .as_ref()
                    .map(|it| it.span())
                    .unwrap_or(then_branch.span()),
            ),
            Box::new(cond),
            then_branch,
            else_branch,
        ))
    }

    fn parse_var_decl(&mut self) -> Result<Stmt<'src>> {
        let decl_type = match self.current()?.kind {
            T::Let => {
                self.advance()?;
                DeclType::Let
            }
            T::Const => {
                self.advance()?;
                DeclType::Const
            }
            T::Var => {
                self.advance()?;
                DeclType::Var
            }
            _ => return self.unexpected_token(),
        };
        let pattern = self.parse_pattern()?;
        let init = if self.current()?.kind == T::Eq {
            self.advance()?;
            Some(self.parse_expr()?)
        } else {
            None
        };
        self.expect_semi()?;
        Ok(Stmt::VarDecl(
            Span::between(
                pattern.span(),
                init.as_ref().map(|it| it.span()).unwrap_or(pattern.span()),
            ),
            decl_type,
            pattern,
            init,
        ))
    }

    fn unexpected_token<T>(&self) -> Result<T> {
        Err(Error::UnexpectedToken(
            self.current()?.line,
            self.current()?.span,
            self.current()?.kind,
        ))
    }

    fn parse_pattern(&mut self) -> Result<Pattern<'src>> {
        let ident = self.expect(T::Ident)?;

        Ok(Pattern::Var(ident.span, ident.text))
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
            T::String => {
                let tok = self.advance()?;
                Ok(Expr::Var(tok.span, tok.text))
            }
            T::Number => {
                let tok = self.advance()?;
                Ok(Expr::Number(tok.span, tok.text))
            }
            T::LBrace => {
                let start = self.advance()?;
                let mut entries = vec![];
                let mut first = true;
                while !matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
                    if !first {
                        self.expect(T::Comma)?;
                    } else {
                        first = false;
                    }
                    let start = self.current()?.span;
                    let ident = self.parse_ident()?;
                    self.expect(T::Colon)?;
                    let expr = self.parse_expr()?;
                    entries.push(ObjectLiteralEntry {
                        span: Span::between(start, expr.span()),
                        key: ident,
                        value: expr,
                    });
                }
                let end = self.expect(T::RBrace)?;
                Ok(Expr::Object(Span::between(start.span, end.span), entries))
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

                    _ => self.unexpected_token(),
                }
            }
            T::Function => {
                let start = self.advance()?;
                let name = if self.at(T::Ident) {
                    Some(self.parse_ident()?)
                } else {
                    None
                };
                let params = self.parse_param_list()?;
                let body = self.parse_block()?;
                Ok(Expr::Function(
                    Span::between(start.span, body.span()),
                    name,
                    params,
                    body,
                ))
            }
            _ => self.unexpected_token(),
        }
    }

    fn at(&self, kind: TokenKind) -> bool {
        self.current().map(|tok| tok.kind == kind).unwrap_or(false)
    }

    fn parse_ident(&mut self) -> Result<Ident<'src>> {
        let tok = self.expect(T::Ident)?;
        Ok(tok.text)
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
                let member_expr = Expr::Index(span, Box::new(lhs), Box::new(prop));
                self.parse_member_expr_tail(member_expr)
            }
            T::Dot => {
                self.advance()?;
                let prop = self.expect(T::Ident)?;
                let span = Span::between(lhs.span(), prop.span);
                let prop_expr = Expr::Prop(span, Box::new(lhs), prop.text);
                self.parse_member_expr_tail(prop_expr)
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
        let body = self.parse_arrow_fn_body()?;

        Ok(Expr::ArrowFn(
            Span::between(params.span, body.span()),
            params,
            body,
        ))
    }

    fn parse_arrow_fn_body(&mut self) -> Result<ArrowFnBody<'src>> {
        match self.current()?.kind {
            T::LBrace => {
                let start = self.advance()?;
                let mut stmts = vec![];
                while !matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
                    let stmt = self.parse_stmt()?;
                    stmts.push(stmt);
                }
                let stop = self.expect(T::RBrace)?;
                let span = Span::between(start.span, stop.span);
                Ok(ArrowFnBody::Block(span, Block { span, stmts }))
            }
            _ => {
                let expr = self.parse_expr()?;
                Ok(ArrowFnBody::Expr(expr.span(), Box::new(expr)))
            }
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
                _ => return self.unexpected_token(),
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
            self.unexpected_token()
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
    use std::{fs::File, io::Read};

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
        let Index(_, obj, c) = *inner_callee else {
            panic!("Expected a member expression")
        };
        assert!(matches!(*c, Var(_, "c")));
        let Index(_, obj, b) = *obj else {
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
        let Expr::ArrowFn(_, _, ArrowFnBody::Block(_, block)) = expr else {
            panic!("Expected an arrow fn expression")
        };
        let [Stmt::Expr(_, first_stmt), Stmt::Expr(_, second_stmt)] = block.stmts.as_slice() else {
            panic!("Expected 2 statements in the block")
        };
        assert!(matches!(**first_stmt, Expr::Var(_, "x")));
        assert!(matches!(**second_stmt, Expr::Var(_, "y")));
    }

    #[test]
    fn parses_var_decl() {
        let source = "let x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Let, Pattern::Var(_, "x"), Some(init)) => {
                assert!(matches!(init, Expr::Var(.., "y")));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "const x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Const, Pattern::Var(_, "x"), Some(init)) => {
                assert!(matches!(init, Expr::Var(.., "y")));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "var x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Var, Pattern::Var(_, "x"), Some(init)) => {
                assert!(matches!(init, Expr::Var(.., "y")));
            }
            _ => panic!("Expected a variable declaration"),
        }
    }

    #[test]
    fn parses_if_stmt() {
        let source = "if (x) y; else z;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        if let Stmt::If(_, cond, then_branch, Some(else_branch)) = stmt {
            assert!(matches!(*cond, Expr::Var(.., "x")));
            let Stmt::Expr(.., e) = *then_branch else {
                panic!("Expected an expression statement");
            };
            assert!(matches!(*e, Expr::Var(.., "y")));
            let Stmt::Expr(.., e) = *else_branch else {
                panic!("Expected an expression statement");
            };
            assert!(matches!(*e, Expr::Var(.., "z")));
        } else {
            panic!("Expected an if statement");
        }
    }

    #[test]
    fn parses_test262_files() {
        let files = glob::glob("../test262/test/**/*.js")
            .expect("Invalid glob pattern")
            .collect::<Vec<_>>();
        let total_files = files.len();
        let mut success_count = 0;
        for entry in files {
            let entry = entry.unwrap();
            let mut str = String::new();
            File::open(&entry)
                .unwrap()
                .read_to_string(&mut str)
                .unwrap();
            let mut parser = Parser::new(&str);
            if parser.parse_source_file().is_ok() {
                success_count += 1;
            }
        }
        eprintln!("Successfully parsed: {success_count}/{total_files} files")
    }
}
