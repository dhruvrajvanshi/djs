use std::mem;

use djs_ast::{
    ArrowFnBody, Block, DeclType, Expr, Ident, ObjectLiteralEntry, Param, ParamList, Pattern,
    SourceFile, Stmt, Text, TryStmt,
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
            T::While => self.parse_while_stmt(),
            T::Try => self.parse_try_stmt(),
            T::Return => self.parse_return_stmt(),
            T::Semi => {
                let tok = self.advance()?;
                Ok(Stmt::Empty(tok.span))
            }
            _ => self.parse_expr_stmt(),
        }
    }

    fn parse_try_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::Try)?;
        let try_block = self.parse_block()?;
        let (catch_name, catch_block) = if self.current()?.kind == T::Catch {
            self.advance()?;
            if self.current()?.kind == T::LParen {
                self.advance()?;
                let name = self.parse_ident()?;
                self.expect(T::RParen)?;
                let block = self.parse_block()?;
                (Some(name), Some(block))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };
        let finally_block = if self.current()?.kind == T::Finally {
            self.advance()?;
            let block = self.parse_block()?;
            Some(block)
        } else {
            None
        };
        let end_span = match (&catch_block, &finally_block) {
            (_, Some(finally_block)) => finally_block.span(),
            (Some(block), None) => block.span(),
            (None, None) => try_block.span(),
        };
        let span = Span::between(start.span, end_span);
        Ok(Stmt::Try(
            span,
            Box::new(TryStmt {
                span,
                try_block,
                catch_name,
                catch_block,
                finally_block,
            }),
        ))
    }

    fn parse_while_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::While)?.span;
        self.expect(T::LParen)?;
        let cond = self.parse_expr()?;
        self.expect(T::RParen)?;
        let body = Box::new(self.parse_stmt()?);
        Ok(Stmt::While(
            Span::between(start, body.span()),
            Box::new(cond),
            body,
        ))
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
        let ident = self.parse_ident()?;

        Ok(Pattern::Var(ident.span, ident))
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
        if self.current_is_on_new_line() {
            return Ok(());
        }
        Err(Error::MissingSemi)
    }

    fn current_is_on_new_line(&self) -> bool {
        let current = self.current();
        let Ok(current) = current else {
            return false;
        };
        current.line
            > self
                .last_token
                .expect("expect_semi must be called after consuming at least 1 token")
                .line
    }
    fn parse_return_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::Return)?.span;
        let expr = if matches!(self.current()?.kind, T::Semi | T::RBrace | T::EndOfFile)
            || self.current_is_on_new_line()
        {
            None
        } else {
            let expr = self.parse_expr()?;
            self.expect_semi()?;
            Some(expr)
        };
        let end_span = expr.as_ref().map(|it| it.span()).unwrap_or(start);
        self.expect_semi()?;
        Ok(Stmt::Return(Span::between(start, end_span), expr))
    }

    pub(super) fn parse_primary_expr(&mut self) -> Result<Expr<'src>> {
        match self.current()?.kind {
            T::Ident => {
                let ident = self.parse_ident()?;
                Ok(Expr::Var(ident.span, ident))
            }
            T::String => {
                let tok = self.advance()?;
                Ok(Expr::String(
                    tok.span,
                    Text {
                        span: tok.span,
                        text: tok.text,
                    },
                ))
            }
            T::Number => {
                let tok = self.advance()?;
                Ok(Expr::Number(
                    tok.span,
                    Text {
                        span: tok.span,
                        text: tok.text,
                    },
                ))
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
            T::Throw => {
                let start = self.advance()?;
                let expr = self.parse_expr()?;
                Ok(Expr::Throw(
                    Span::between(start.span, expr.span()),
                    Box::new(expr),
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
        Ok(Ident {
            span: tok.span,
            text: tok.text,
        })
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
                let prop = self.parse_ident()?;
                let span = Span::between(lhs.span(), prop.span);
                let prop_expr = Expr::Prop(span, Box::new(lhs), prop);
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
                    let name = self.parse_ident()?;
                    params.push(Param {
                        span: name.span,
                        name,
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
    macro_rules! ident {
        ($value: pat) => {
            Ident {
                text: $value,
                span: _,
            }
        };
    }

    macro_rules! exp_var {
        ($value: pat) => {
            Expr::Var(_, ident!($value))
        };
    }

    #[test]
    fn test_parse_var_expr() {
        let source = "x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(_, Ident { text: "x", .. })));
    }

    #[test]
    fn should_parse_parenthesized_expr() {
        let source = "(x)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(_, ident!("x"))));
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
        let exp_var!("x") = **x else {
            panic!("Expected a variable expression")
        };
        let Stmt::Expr(_, y) = &source_file.stmts[1] else {
            panic!("Expected an expression statement")
        };
        let exp_var!("y") = **y else {
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
                assert!(matches!(**f, exp_var!("f")));
                assert!(matches!(
                    args.as_slice(),
                    [exp_var!("x"), exp_var!("y"), exp_var!("z")]
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
        assert!(matches!(args.as_slice(), [exp_var!("d"), exp_var!("e")]));
        assert!(matches!(*outer_callee, Call(..)));
        let Call(_, inner_callee, args) = *outer_callee else {
            panic!("Expected a call expression")
        };
        assert!(matches!(args.as_slice(), []));
        let Index(_, obj, c) = *inner_callee else {
            panic!("Expected a member expression")
        };
        assert!(matches!(*c, exp_var!("c")));
        let Index(_, obj, b) = *obj else {
            panic!("Expected a member expression")
        };
        assert!(matches!(*b, exp_var!("b")));
        assert!(matches!(*obj, exp_var!("a")));
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
        assert!(matches!(**first_stmt, exp_var!("x")));
        assert!(matches!(**second_stmt, exp_var!("y")));
    }

    #[test]
    fn parses_var_decl() {
        let source = "let x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Let, Pattern::Var(_, ident!("x")), Some(init)) => {
                assert!(matches!(init, Expr::Var(.., ident!("y"))));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "const x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Const, Pattern::Var(_, ident!("x")), Some(init)) => {
                assert!(matches!(init, exp_var!("y")));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "var x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(_, DeclType::Var, Pattern::Var(_, ident!("x")), Some(init)) => {
                assert!(matches!(init, Expr::Var(.., ident!("y"))));
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
            assert!(matches!(*cond, exp_var!("x")));
            let Stmt::Expr(.., e) = *then_branch else {
                panic!("Expected an expression statement");
            };
            assert!(matches!(*e, exp_var!("y")));
            let Stmt::Expr(.., e) = *else_branch else {
                panic!("Expected an expression statement");
            };
            assert!(matches!(*e, exp_var!("z")));
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

    #[test]
    fn parses_try_catch() {
        let source = "try { x; } catch (e) { y; } finally { z; }";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        let Stmt::Try(_, try_stmt) = stmt else {
            panic!("Expected a try statement");
        };
        let TryStmt {
            try_block,
            catch_name,
            catch_block,
            finally_block,
            ..
        } = *try_stmt;
        assert!(matches!(catch_name, Some(..)));
        assert!(matches!(catch_block, Some(..)));
        assert!(matches!(finally_block, Some(..)));
        let Block { stmts, .. } = try_block;
        assert!(matches!(stmts.as_slice(), [Stmt::Expr(..)]));
    }

    #[test]
    fn parses_return_stmt() {
        let source = "return;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        assert!(matches!(stmt, Stmt::Return(_, None)));
    }

    #[test]
    fn parses_return_stmt_with_expr_on_next_line() {
        let source = "return\nx;"; // Since x is on the next line, asi should kick in
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        assert!(matches!(stmt, Stmt::Return(_, None)));
    }

    #[test]
    fn parses_return_stmt_with_expr_on_the_same_line() {
        let source = "return x;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::Return(_, Some(expr)) => {
                assert!(matches!(expr, exp_var!("x")));
            }
            _ => panic!("Expected a return statement"),
        }
    }
}
