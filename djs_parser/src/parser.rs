use std::mem;

use djs_ast::{
    ArrowFnBody, BinOp, Block, Class, ClassBody, ClassMember, DeclType, Expr, For, ForInOrOf,
    ForInit, Function, Ident, InOrOf, MethodDef, ObjectKey, ObjectLiteralEntry, Param, ParamList,
    Pattern, SourceFile, Stmt, Text, TryStmt, VarDecl,
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
    expected: TokenKind,
}
pub type Result<T> = std::result::Result<T, Error>;

type T = TokenKind;

#[derive(Debug)]
pub enum Error {
    UnexpectedToken {
        line: u32,
        span: Span,
        expected: TokenKind,
        found: TokenKind,
        last_token: Option<TokenKind>,
    },
    UnexpectedEOF(u32),
    MissingSemi {
        line: u32,
        found: TokenKind,
    },
    Lexer(lexer::Error),
}
impl Error {
    pub fn line(&self) -> u32 {
        match self {
            Error::UnexpectedToken { line, .. } => *line,
            Error::UnexpectedEOF(line) => *line,
            Error::MissingSemi { line, .. } => *line,
            Error::Lexer(e) => e.line(),
        }
    }
}

macro_rules! define_binop_parser {
    ($fn_name: ident, $next_fn: ident, $op: pat) => {
        fn $fn_name(&mut self) -> Result<Expr<'src>> {
            let mut lhs = self.$next_fn()?;
            while matches!(self.current()?.kind, $op) {
                let op = self.advance()?;
                let op = parse_bin_op(op.kind);
                let rhs = self.$next_fn()?;
                let span = Span::between(lhs.span(), rhs.span());
                lhs = Expr::BinOp(span, Box::new(lhs), op, Box::new(rhs));
            }
            Ok(lhs)
        }
    };
}

impl<'src> Parser<'src> {
    pub fn new(source: &'src str) -> Self {
        let mut lexer = Lexer::new(source);
        let current_token = lexer.next_token();
        Parser {
            last_token: None,
            lexer,
            current_token,
            expected: T::EndOfFile,
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
            T::Let | T::Const | T::Var => {
                let decl = self.parse_var_decl()?;
                Ok(Stmt::VarDecl(decl.span, decl))
            }
            T::If => self.parse_if_stmt(),
            T::While => self.parse_while_stmt(),
            T::Do => self.parse_do_while_stmt(),
            T::Try => self.parse_try_stmt(),
            T::Return => self.parse_return_stmt(),
            T::Semi => {
                let tok = self.advance()?;
                Ok(Stmt::Empty(tok.span))
            }
            T::LBrace => self
                .parse_block()
                .map(|block| Stmt::Block(block.span, block)),
            T::For => {
                let mut for_stmt_snapshot = self.clone();
                match for_stmt_snapshot.parse_for_stmt() {
                    Ok(stmt) => {
                        self.commit(for_stmt_snapshot);
                        Ok(stmt)
                    }
                    Err(..) => self.parse_for_in_of_stmt(),
                }
            }
            T::Break => {
                let span = self.advance()?.span;
                self.expect_semi()?;
                Ok(Stmt::Break(span, None))
            }
            T::Continue => {
                let span = self.advance()?.span;
                self.expect_semi()?;
                Ok(Stmt::Continue(span, None))
            }
            T::Debugger => {
                let span = self.advance()?.span;
                self.expect_semi()?;
                Ok(Stmt::Debugger(span))
            }
            T::With => {
                let start = self.advance()?;
                self.expect(T::LParen)?;
                let obj = self.parse_expr()?;
                self.expect(T::RParen)?;
                let body = self.parse_stmt()?;
                Ok(Stmt::With(
                    Span::between(start.span, body.span()),
                    Box::new(obj),
                    Box::new(body),
                ))
            }
            T::Function => {
                let f = self.parse_function()?;
                Ok(Stmt::FunctionDecl(f.span, f))
            }
            T::Class => {
                let c = self.parse_class()?;
                Ok(Stmt::ClassDecl(c.span, c))
            }
            T::Async => {
                if self.next_is(T::Function) {
                    self.advance()?;
                    let f = self.parse_function()?;
                    Ok(Stmt::FunctionDecl(f.span, f))
                } else {
                    self.unexpected_token()
                }
            }
            _ => self.parse_expr_stmt(),
        }
    }
    fn parse_do_while_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::Do)?;
        let body = Box::new(self.parse_stmt()?);
        self.expect(T::While)?;
        self.expect(T::LParen)?;
        let cond = self.parse_expr()?;
        self.expect(T::RParen)?;
        Ok(Stmt::DoWhile(
            Span::between(start.span, cond.span()),
            body,
            Box::new(cond),
        ))
    }

    fn parse_class(&mut self) -> Result<Class<'src>> {
        let first = self.expect(T::Class)?;
        let name = self.parse_optional_binding_ident()?;
        let superclass = if self.current()?.kind == T::Extends {
            self.advance()?;
            Some(self.parse_left_hand_side_expr()?)
        } else {
            None
        };
        let body_start = self.expect(T::LBrace)?;
        let mut members = vec![];
        while !matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
            members.push(self.parse_class_member()?);
        }
        let body_end = self.expect(T::RBrace)?;
        let span = Span::between(first.span, body_end.span);
        Ok(Class {
            span,
            name,
            superclass,
            body: ClassBody {
                span: Span::between(body_start.span, body_end.span),
                members,
            },
        })
    }

    fn parse_class_member(&mut self) -> Result<ClassMember<'src>> {
        Ok(ClassMember::MethodDef(self.parse_method_def()?))
    }

    fn parse_method_def(&mut self) -> Result<MethodDef<'src>> {
        let static_token = if self.current()?.kind == T::Static {
            Some(self.advance()?)
        } else {
            None
        };
        let name = self.parse_object_key()?;
        let start = static_token.map(|it| it.span).unwrap_or(name.span());
        let params = self.parse_param_list()?;
        let body = self.parse_block()?;
        let span = Span::between(start, body.span);
        Ok(MethodDef {
            span,
            name,
            body: Function {
                span,
                name: None,
                params,
                body,
                is_generator: false,
            },
        })
    }

    fn parse_binding_ident(&mut self) -> Result<Ident<'src>> {
        // TODO: Handle [Yield, Await] as identifier names
        self.parse_ident()
    }

    fn parse_optional_binding_ident(&mut self) -> Result<Option<Ident<'src>>> {
        if self.current()?.kind == T::Ident {
            Ok(Some(self.parse_binding_ident()?))
        } else {
            Ok(None)
        }
    }

    fn parse_for_in_of_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::For)?.span;
        self.expect(T::LParen)?;
        let decl_type = match self.current()?.kind {
            T::Let => {
                self.advance()?;
                Some(DeclType::Let)
            }
            T::Const => {
                self.advance()?;
                Some(DeclType::Const)
            }
            T::Var => {
                self.advance()?;
                Some(DeclType::Var)
            }
            _ => None,
        };
        let lhs = self.parse_pattern()?;
        let in_or_of = match self.current()?.kind {
            T::In => {
                self.advance()?;
                InOrOf::In
            }
            T::Of => {
                self.advance()?;
                InOrOf::Of
            }
            _ => return self.unexpected_token(),
        };
        let rhs = self.parse_assignment_expr()?;
        self.expect(T::RParen)?;
        let body = Box::new(self.parse_stmt()?);
        Ok(Stmt::ForInOrOf(
            Span::between(start, body.span()),
            ForInOrOf {
                span: Span::between(start, body.span()),
                in_or_of,
                decl_type,
                lhs,
                rhs,
                body,
            },
        ))
    }

    fn parse_for_stmt(&mut self) -> Result<Stmt<'src>> {
        let first = self.expect(T::For)?;
        self.expect(T::LParen)?;
        let init = match self.current()?.kind {
            // TODO: Handle the lookahead != let [ rule from
            //       https://tc39.es/ecma262/#prod-ForStatement
            T::Let | T::Const | T::Var => {
                let decl = self.parse_var_decl()?;
                Some(ForInit::VarDecl(decl))
            }
            T::Semi => {
                self.advance()?;
                None
            }
            _ => {
                let expr = self.parse_expr()?;
                // No ASI allowed here
                self.expect(T::Semi)?;
                Some(ForInit::Expr(expr))
            }
        };
        let cond = if self.current()?.kind == T::Semi {
            self.advance()?;
            None
        } else {
            let expr = self.parse_expr()?;
            // No ASI allowed here
            self.expect(T::Semi)?;
            Some(expr)
        };
        let update = if self.current()?.kind == T::RParen {
            None
        } else {
            Some(self.parse_expr()?)
        };
        self.expect(T::RParen)?;
        let body = Box::new(self.parse_stmt()?);
        let span = Span::between(first.span, body.span());
        Ok(Stmt::For(
            span,
            For {
                span,
                init: init.unwrap_or(ForInit::Expr(Expr::Number(
                    first.span,
                    Text {
                        span: first.span,
                        text: "0",
                    },
                ))),
                test: cond,
                update,
                body,
            },
        ))
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

    fn parse_var_decl(&mut self) -> Result<VarDecl<'src>> {
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
        let pattern = self.parse_pattern_with_precedence(/* allow_assignment */ false)?;
        let init = if self.current()?.kind == T::Eq {
            self.advance()?;
            Some(self.parse_expr()?)
        } else {
            None
        };
        self.expect_semi()?;
        Ok(VarDecl {
            span: Span::between(
                pattern.span(),
                init.as_ref().map(|it| it.span()).unwrap_or(pattern.span()),
            ),
            decl_type,
            pattern,
            init,
        })
    }

    fn unexpected_token<T>(&self) -> Result<T> {
        Err(Error::UnexpectedToken {
            line: self.current()?.line,
            span: self.current()?.span,
            found: self.current()?.kind,
            last_token: self.last_token.map(|it| it.kind),
            expected: self.expected,
        })
    }

    pub(super) fn parse_pattern(&mut self) -> Result<Pattern<'src>> {
        self.parse_pattern_with_precedence(/* allow_assignment */ true)
    }

    fn parse_pattern_with_precedence(&mut self, allow_assignment: bool) -> Result<Pattern<'src>> {
        let head = match self.current()?.kind {
            T::Ident => {
                let ident = self.parse_binding_ident()?;
                Pattern::Var(ident.span, ident)
            }
            T::LSquare => {
                let start = self.advance()?;
                let mut elements = vec![];
                loop {
                    match self.current()?.kind {
                        T::Comma if self.next_is(T::RParen) => {
                            self.advance()?;
                            break;
                        }
                        T::RSquare | T::EndOfFile => {
                            break;
                        }
                        T::Comma => {
                            self.advance()?;
                            elements.push(None);
                        }
                        _ => {
                            elements.push(Some(self.parse_pattern()?));
                            if self.at(T::RSquare) {
                                break;
                            }
                            self.expect(T::Comma)?;
                        }
                    }
                }
                let end = self.expect(T::RSquare)?;
                Pattern::Array(Span::between(start.span, end.span), elements)
            }
            _ => self.unexpected_token()?,
        };
        if allow_assignment && self.at(T::Eq) {
            self.advance()?;
            let init = self.parse_assignment_expr()?;
            Ok(Pattern::Assignment(
                Span::between(head.span(), init.span()),
                Box::new(head),
                Box::new(init),
            ))
        } else {
            Ok(head)
        }
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
        Err(Error::MissingSemi {
            line: self.current_line(),
            found: self.current()?.kind,
        })
    }

    fn current_line(&self) -> u32 {
        self.current().map(|it| it.line).unwrap_or(1)
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
                match self.current()?.kind {
                    T::FatArrow => {
                        let params = ParamList {
                            span: ident.span,
                            params: vec![Param {
                                span: ident.span,
                                pattern: Pattern::Var(ident.span, ident),
                            }],
                        };
                        let body = self.parse_arrow_fn_body()?;
                        Ok(Expr::ArrowFn(
                            Span::between(params.span(), body.span()),
                            params,
                            body,
                        ))
                    }
                    _ => Ok(Expr::Var(ident.span, ident)),
                }
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
                let entries =
                    self.parse_comma_separated_list(T::RBrace, Self::parse_object_literal_entry)?;
                let end = self.expect(T::RBrace)?;
                Ok(Expr::Object(Span::between(start.span, end.span), entries))
            }
            T::LParen => self.parse_paren_expr(),
            T::Async => {
                let start = self.advance()?;
                if self.at(T::Function) {
                    let f = self.parse_function()?;
                    Ok(Expr::Function(Span::between(start.span, f.span), f))
                } else {
                    self.parse_arrow_fn()
                }
            }
            T::Function => {
                let f = self.parse_function()?;
                Ok(Expr::Function(f.span, f))
            }
            T::Throw => {
                let start = self.advance()?;
                let expr = self.parse_expr()?;
                Ok(Expr::Throw(
                    Span::between(start.span, expr.span()),
                    Box::new(expr),
                ))
            }
            T::LSquare => {
                let start = self.advance()?;
                let elements =
                    self.parse_comma_separated_list(T::RSquare, Self::parse_assignment_expr)?;
                let end = self.expect(T::RSquare)?;
                Ok(Expr::Array(Span::between(start.span, end.span), elements))
            }
            T::Regex => {
                let tok = self.advance()?;
                Ok(Expr::Regex(
                    tok.span,
                    Text {
                        span: tok.span,
                        text: tok.text,
                    },
                ))
            }
            T::True => Ok(Expr::Boolean(self.advance()?.span, true)),
            T::False => Ok(Expr::Boolean(self.advance()?.span, false)),
            T::Super => Ok(Expr::Super(self.advance()?.span)),
            T::Class => {
                let cls = self.parse_class()?;
                Ok(Expr::Class(cls.span, Box::new(cls)))
            }
            _ => self.unexpected_token(),
        }
    }

    fn peek(&self) -> Option<Token> {
        let mut clone = self.clone();
        match clone.advance() {
            Err(_) => None,
            Ok(_) => match clone.current() {
                Ok(tok) => Some(*tok),
                Err(_) => None,
            },
        }
    }

    fn parse_function(&mut self) -> Result<Function<'src>> {
        let start = self.advance()?;
        let is_generator = if self.at(T::Star) {
            self.advance()?;
            true
        } else {
            false
        };
        let name = if self.at(T::Ident) {
            Some(self.parse_ident()?)
        } else {
            None
        };
        let params = self.parse_param_list()?;
        let body = self.parse_block()?;
        let span = Span::between(start.span, body.span());
        let f = Function {
            span,
            name,
            params,
            body,
            is_generator,
        };
        Ok(f)
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

    fn parse_comma_separated_list<Item, F: Fn(&mut Self) -> Result<Item>>(
        &mut self,
        end_token: TokenKind,
        parse_item: F,
    ) -> Result<Vec<Item>> {
        let mut items = vec![];
        let mut first = true;
        while !self.at(T::EndOfFile) && !self.at(end_token) {
            if !first {
                self.expect(T::Comma)?;
            } else {
                first = false;
            }
            let entry = parse_item(self)?;
            items.push(entry);
            if self.at(T::Comma) && self.next_is(end_token) {
                self.advance()?;
                break;
            }
        }
        Ok(items)
    }

    fn parse_object_literal_entry(&mut self) -> Result<ObjectLiteralEntry<'src>> {
        let start = self.current()?.span;
        let ident = self.parse_object_key()?;
        self.expect(T::Colon)?;
        let expr = self.parse_assignment_expr()?;
        Ok(ObjectLiteralEntry {
            span: Span::between(start, expr.span()),
            key: ident,
            value: expr,
        })
    }

    fn parse_object_key(&mut self) -> Result<ObjectKey<'src>> {
        Ok(match self.current()?.kind {
            T::String => {
                let tok = self.advance()?;
                ObjectKey::String(
                    tok.span,
                    Text {
                        span: tok.span,
                        text: tok.text,
                    },
                )
            }
            T::LSquare => {
                let start = self.advance()?.span;
                let expr = self.parse_expr()?;
                let stop = self.expect(T::RSquare)?.span;
                ObjectKey::Computed(Span::between(start, stop), expr)
            }
            _ => {
                let ident = self.parse_member_ident_name()?;
                ObjectKey::Ident(ident.span, ident)
            }
        })
    }

    fn parse_expr(&mut self) -> Result<Expr<'src>> {
        let mut comma_exprs = vec![self.parse_assignment_expr()?];
        while self.current()?.kind == T::Comma {
            self.advance()?;
            comma_exprs.push(self.parse_assignment_expr()?);
        }
        if comma_exprs.len() == 1 {
            Ok(comma_exprs.pop().unwrap())
        } else {
            let start = comma_exprs.first().unwrap().span();
            let end = comma_exprs.last().unwrap().span();
            Ok(Expr::Comma(Span::between(start, end), comma_exprs))
        }
    }
    fn parse_assignment_expr(&mut self) -> Result<Expr<'src>> {
        // TODO
        match self.current()?.kind {
            T::Yield => {
                let start = self.advance()?;
                if self.current_is_on_new_line() {
                    Ok(Expr::Yield(start.span, None))
                } else {
                    let expr = self.parse_assignment_expr()?;
                    Ok(Expr::Yield(
                        Span::between(start.span, expr.span()),
                        Some(Box::new(expr)),
                    ))
                }
            }
            T::Ident if self.next_is(T::FatArrow) && self.next_is_on_the_same_line() => {
                let pattern = self.parse_pattern()?;
                let params = ParamList {
                    span: pattern.span(),
                    params: vec![Param {
                        span: pattern.span(),
                        pattern,
                    }],
                };
                self.expect(T::FatArrow)?;
                let body = self.parse_arrow_fn_body()?;
                Ok(Expr::ArrowFn(
                    Span::between(params.span(), body.span()),
                    params,
                    body,
                ))
            }
            T::LParen if self.can_start_arrow_fn() => self.parse_arrow_fn(),
            _ => {
                let mut snapshot = self.clone();
                let assignment = snapshot.parse_left_hand_side_expr();
                // conditional_expr is a superset of left_hand_side_expr,
                // therefore, we must try and parse the sequence "left_hand_side_expr = rhs" first
                // then fallback to conditional_expr
                // TODO: Avoid doing a snapshot and lookahead in common cases
                match (snapshot.current()?.kind, assignment) {
                    (T::Eq, Ok(lhs)) => {
                        self.commit(snapshot);
                        self.advance()?;
                        let rhs = self.parse_assignment_expr()?;
                        let span = Span::between(lhs.span(), rhs.span());
                        Ok(Expr::Assign(span, Box::new(lhs), Box::new(rhs)))
                    }
                    _ => self.parse_conditional_expr(),
                }
            }
        }
    }

    fn can_start_arrow_fn(&self) -> bool {
        let mut clone = self.clone();
        let Ok(_) = clone.expect(T::LParen) else {
            return false;
        };
        let Ok(_) = clone.parse_comma_separated_list(T::RParen, Self::parse_param) else {
            return false;
        };
        let Ok(rparen) = clone.expect(T::RParen) else {
            return false;
        };
        let Ok(fatarrow) = clone.expect(T::FatArrow) else {
            return false;
        };
        rparen.line == fatarrow.line
    }

    fn next_is(&self, t: TokenKind) -> bool {
        self.peek().map(|tok| tok.kind == t).unwrap_or(false)
    }

    fn next_is_on_the_same_line(&self) -> bool {
        let Ok(current_line) = self.current().map(|tok| tok.line) else {
            return false;
        };
        let Some(next_line) = self.peek().map(|tok| tok.line) else {
            return false;
        };
        current_line == next_line
    }

    fn parse_conditional_expr(&mut self) -> Result<Expr<'src>> {
        // TODO
        let lhs = self.parse_short_circuit_expr()?;
        match self.current()?.kind {
            T::Question => {
                self.advance()?;
                let consequent = self.parse_expr()?;
                self.expect(T::Colon)?;
                let alternate = self.parse_assignment_expr()?;
                let span = Span::between(lhs.span(), alternate.span());
                Ok(Expr::Ternary(
                    span,
                    Box::new(lhs),
                    Box::new(consequent),
                    Box::new(alternate),
                ))
            }
            _ => Ok(lhs),
        }
    }

    fn parse_short_circuit_expr(&mut self) -> Result<Expr<'src>> {
        self.parse_logical_or_expr()
        // TODO: parse_coalesce_expr
    }

    define_binop_parser!(parse_logical_or_expr, parse_logical_and_expr, T::AmpAmp);
    define_binop_parser!(parse_logical_and_expr, parse_bitwise_or_expr, T::VBarVBar);
    define_binop_parser!(parse_bitwise_or_expr, parse_bitwise_xor_expr, T::VBar);
    define_binop_parser!(parse_bitwise_xor_expr, parse_bitwise_and_expr, T::Caret);
    define_binop_parser!(parse_bitwise_and_expr, parse_equality_expr, T::Amp);

    define_binop_parser!(
        parse_equality_expr,
        parse_relational_expr,
        T::EqEq | T::EqEqEq | T::BangEq | T::BangEqEq | T::In | T::Instanceof
    );

    // https://tc39.es/ecma262/#prod-AdditiveExpression
    define_binop_parser!(
        parse_relational_expr,
        parse_shift_expr,
        T::LessThan | T::GreaterThan | T::LessThanEq | T::GreaterThanEq | T::In | T::Instanceof
    );

    fn parse_shift_expr(&mut self) -> Result<Expr<'src>> {
        // TODO
        self.parse_additive_expr()
    }

    define_binop_parser!(
        parse_additive_expr,
        parse_multiplicative_expr,
        T::Plus | T::Minus
    );

    define_binop_parser!(
        parse_multiplicative_expr,
        parse_exponentiation_expr,
        T::Star | T::Slash
    );

    fn parse_exponentiation_expr(&mut self) -> Result<Expr<'src>> {
        // TODO
        self.parse_unary_expr()
    }

    fn parse_unary_expr(&mut self) -> Result<Expr<'src>> {
        macro_rules! make_unary {
            ($case: ident) => {{
                let start = self.advance()?;
                let expr = self.parse_unary_expr()?;
                Ok(Expr::$case(
                    Span::between(start.span, expr.span()),
                    Box::new(expr),
                ))
            }};
        }
        match self.current()?.kind {
            T::Delete => make_unary!(Delete),
            T::Bang => make_unary!(Not),
            T::Plus => make_unary!(UnaryPlus),
            T::Minus => make_unary!(UnaryMinus),
            T::Typeof => make_unary!(TypeOf),
            T::Void => make_unary!(Void),
            T::Await => make_unary!(Await),
            _ => self.parse_update_expr(),
        }
    }

    fn parse_update_expr(&mut self) -> Result<Expr<'src>> {
        match self.current()?.kind {
            T::PlusPlus => {
                let start = self.advance()?;
                let expr = self.parse_unary_expr()?;
                return Ok(Expr::PreIncrement(
                    Span::between(start.span, expr.span()),
                    Box::new(expr),
                ));
            }
            T::MinusMinus => {
                let start = self.advance()?;
                let expr = self.parse_unary_expr()?;
                return Ok(Expr::PreDecrement(
                    Span::between(start.span, expr.span()),
                    Box::new(expr),
                ));
            }
            _ => {}
        }
        let lhs = self.parse_left_hand_side_expr()?;
        if self.at(T::PlusPlus) && !self.current_is_on_new_line() {
            let op = self.advance()?;

            Ok(Expr::PostIncrement(
                Span::between(lhs.span(), op.span),
                Box::new(lhs),
            ))
        } else if self.at(T::MinusMinus) && !self.current_is_on_new_line() {
            let op = self.advance()?;

            Ok(Expr::PostDecrement(
                Span::between(lhs.span(), op.span),
                Box::new(lhs),
            ))
        } else {
            Ok(lhs)
        }
    }

    ///
    ///
    /// MemberExpression :
    ///   (PrimaryExpression | new MemberExpression) ((. IdentifierName) | [ Expression ] )*
    ///
    ///
    /// CallExpression :
    ///    MemberExpression (Arguments | [Expression] | . IdentifierName)*
    ///
    /// LeftHandSideExpression :
    ///   MemberExpression
    ///   CallExpression
    ///   OptionalExpression
    ///
    ///
    ///
    fn parse_left_hand_side_expr(&mut self) -> Result<Expr<'src>> {
        self.parse_member_or_call_expr(/* allow_calls */ true)
    }

    fn parse_member_or_call_expr(&mut self, allow_calls: bool) -> Result<Expr<'src>> {
        let mut lhs = match self.current()?.kind {
            T::New => {
                let start = self.advance()?;
                let expr = self.parse_member_or_call_expr(
                    // Since new Foo() means `new (Foo)()` and not (new (Foo())), we don't allow calls here
                    /* allow_calls */
                    false,
                )?;
                let span = Span::between(start.span, expr.span());
                Expr::New(span, Box::new(expr))
            }
            _ => self.parse_primary_expr()?,
        };
        loop {
            match self.current()?.kind {
                T::Dot => {
                    self.advance()?;
                    let prop = self.parse_member_ident_name()?;
                    let span = Span::between(lhs.span(), prop.span());
                    lhs = Expr::Prop(span, Box::new(lhs), prop);
                }
                T::LSquare => {
                    let start = self.advance()?;
                    let prop = self.parse_expr()?;
                    let end = self.expect(T::RSquare)?;
                    let span = Span::between(start.span, end.span);
                    lhs = Expr::Index(span, Box::new(lhs), Box::new(prop));
                }
                T::LParen if allow_calls => {
                    let (args, args_span) = self.parse_arguments()?;
                    let span = Span::between(lhs.span(), args_span);
                    lhs = Expr::Call(span, Box::new(lhs), args);
                }
                _ => {
                    break;
                }
            }
        }
        Ok(lhs)
    }

    /// property names are allowed to contain keywords
    fn parse_member_ident_name(&mut self) -> Result<Ident<'src>> {
        let tok = self.current()?.kind;
        if tok.is_keyword() {
            let tok = self.advance()?;
            Ok(Ident {
                span: tok.span,
                text: tok.text,
            })
        } else {
            self.parse_ident()
        }
    }

    fn parse_arguments(&mut self) -> Result<(Vec<Expr<'src>>, Span)> {
        let first = self.expect(T::LParen)?;
        let args = self.parse_arg_list()?;
        let last = self.expect(T::RParen)?;
        let span = Span::between(first.span, last.span);
        Ok((args, span))
    }

    fn parse_arg_list(&mut self) -> Result<Vec<Expr<'src>>> {
        let mut args = Vec::new();
        loop {
            if matches!(self.current()?.kind, T::RParen | T::EndOfFile) {
                break;
            }
            args.push(
                // We want one level below parse_expr here because
                // we don't want each argument to be parsed as a comma expression
                self.parse_assignment_expr()?,
            );
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
        let params = self.parse_comma_separated_list(T::RParen, Self::parse_param)?;
        let stop = self.expect(T::RParen)?;
        Ok(ParamList {
            span: Span {
                start: start.span.start,
                end: stop.span.end,
            },
            params,
        })
    }

    fn parse_param(&mut self) -> Result<Param<'src>> {
        let pattern = self.parse_pattern()?;
        Ok(Param {
            span: pattern.span(),
            pattern,
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
            self.expected = kind;
            self.unexpected_token()
        }
    }
}
impl From<lexer::Error> for Error {
    fn from(e: lexer::Error) -> Self {
        Error::Lexer(e)
    }
}

fn parse_bin_op(kind: TokenKind) -> BinOp {
    match kind {
        T::EqEq => BinOp::EqEq,
        T::EqEqEq => BinOp::EqEqEq,
        T::BangEq => BinOp::NotEq,
        T::BangEqEq => BinOp::NotEqEq,
        T::LessThan => BinOp::Lt,
        T::LessThanEq => BinOp::Lte,
        T::GreaterThan => BinOp::Gt,
        T::GreaterThanEq => BinOp::Gte,
        T::Plus => BinOp::Add,
        T::Minus => BinOp::Sub,
        T::Star => BinOp::Mul,
        T::Slash => BinOp::Div,
        T::In => BinOp::In,
        T::Instanceof => BinOp::Instanceof,
        T::AmpAmp => BinOp::And,
        T::VBarVBar => BinOp::Or,
        T::VBar => BinOp::BitOr,
        T::Caret => BinOp::BitXor,
        T::Amp => BinOp::BitAnd,

        k => panic!("Invalid operator {k:?}"),
    }
}

#[cfg(test)]
mod tests {
    use core::panic;
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
            Stmt::VarDecl(
                _,
                VarDecl {
                    decl_type: DeclType::Let,
                    pattern: Pattern::Var(_, ident!("x")),
                    init: Some(init),
                    ..
                },
            ) => {
                assert!(matches!(init, Expr::Var(.., ident!("y"))));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "const x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(
                _,
                VarDecl {
                    decl_type: DeclType::Const,
                    pattern: Pattern::Var(_, ident!("x")),
                    init: Some(init),
                    ..
                },
            ) => {
                assert!(matches!(init, Expr::Var(.., ident!("y"))));
            }
            _ => panic!("Expected a variable declaration"),
        }

        let source = "var x = y;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::VarDecl(
                _,
                VarDecl {
                    decl_type: DeclType::Var,
                    pattern: Pattern::Var(_, ident!("x")),
                    init: Some(init),
                    ..
                },
            ) => {
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
            if entry.to_str().unwrap().contains("staging") {
                continue;
            }
            let mut str = String::new();
            File::open(&entry)
                .unwrap()
                .read_to_string(&mut str)
                .unwrap();
            if entry
                .to_str()
                .unwrap()
                .contains("test/language/statements/function/S13.2.1_A1_T1.js")
            {
                // This case is deliberately written to test the parser's ability to
                // handle nesting.
                // This will cause a stack overflow at the moment.
                // TODO: Avoid creating separate functions for binops
                continue;
            }

            let expected_parse_error = syntax_error_expected(&str);
            let mut parser = Parser::new(&str);
            let result = parser.parse_source_file();
            match result {
                Ok(..) => {
                    if !expected_parse_error {
                        success_count += 1;
                    } else {
                        println!("{entry:?}:) Expected a parse error but the file was parsed successfully");
                    }
                }
                Err(e) => {
                    let line = e.line();
                    if expected_parse_error {
                        success_count += 1;
                    } else {
                        let path = entry.to_str().unwrap();
                        println!("{path}:{line}: {e:?}");
                    }
                }
            }
        }
        eprintln!("Successfully parsed: {success_count}/{total_files} files");
        // Update this when the parser is more complete
        let expected_successes = 27102;
        if success_count > expected_successes {
            let improvement = success_count - expected_successes;
            panic!("🎉 Good job! After this change, the parser handles {improvement} more case(s). Please Update the baseline in parser.rs::test::parses_test262_files::expected_successes to {success_count}");
        }
        assert_eq!(success_count, expected_successes);
    }

    fn syntax_error_expected(s: &str) -> bool {
        let Some(frontmatter_start) = s.find("/*---") else {
            return false;
        };
        let Some(frontmatter_end) = s.find("---*/") else {
            return false;
        };
        let substr = &s[frontmatter_start..frontmatter_end];
        let is_negative = substr.contains("negative:");
        //  phase: parse
        //  type: SyntaxError
        let syntax_error_expected =
            substr.contains("phase: parse") && substr.contains("type: SyntaxError");
        is_negative && syntax_error_expected
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

    #[test]
    fn parses_empty_for_loop() {
        let source = "for(;;);";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        assert!(matches!(stmt, Stmt::For(..)));
    }

    macro_rules! assert_matches {
        ($e: expr, $p: pat) => {
            match $e {
                $p => {}
                e => panic!("Expected match failure; Found {e:?}"),
            }
        };
    }

    #[test]
    fn parses_for_with_init_and_2_expressions() {
        let source = "for(let x = 0; y; x) {}";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::For(
                _,
                For {
                    init: ForInit::VarDecl(VarDecl { pattern, init, .. }),
                    test,
                    update,
                    body,
                    ..
                },
            ) => {
                assert!(matches!(pattern, Pattern::Var(..)));
                assert!(matches!(init, Some(Expr::Number(..))));
                assert!(matches!(test, Some(Expr::Var(..))));
                assert!(matches!(update, Some(Expr::Var(..))));
                assert_matches!(*body, Stmt::Block(..));
            }
            e => panic!("Expected a for statement; Found {e:?}"),
        }
    }

    #[test]
    fn parses_postincrement_expr() {
        let source = "x++;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::Expr(_, e) => {
                assert_matches!(*e, Expr::PostIncrement(..))
            }
            e => panic!("Expected a post increment expression; Found {e:?}"),
        }
    }

    #[test]
    fn parses_postincrement_property_expr() {
        let source = "x.y++;";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        let Stmt::Expr(_, e) = stmt else {
            panic!("Expected an expression statement; Found {stmt:?}");
        };

        let Expr::PostIncrement(_, e) = *e else {
            panic!("Expected a post increment expression; Found {e:?}");
        };
        let Expr::Prop(_, obj, prop) = *e else {
            panic!("Expected a property expression; Found {e:?}");
        };
        assert_matches!(*obj, Expr::Var(..));
        assert_matches!(prop, ident!("y"));
    }

    #[test]
    fn parses_simple_for_of_stmt() {
        let src = "for(let x of y) z;";
        let mut parser = Parser::new(src);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::ForInOrOf(
                _,
                ForInOrOf {
                    decl_type: Some(DeclType::Let),
                    lhs: Pattern::Var(_, ident!("x")),
                    rhs: Expr::Var(_, ident!("y")),
                    body,
                    ..
                },
            ) => {
                assert_matches!(*body, Stmt::Expr(..));
            }
            e => panic!("Expected a for of statement; Found {e:?}"),
        }
    }

    #[test]
    fn parses_chained_constructor_property() {
        let src = "new Date(1899, 0).getYear()";
        let mut parser = Parser::new(src);
        let expr = parser.parse_expr().unwrap();
        let Expr::Call(_, outer_callee, outer_args) = expr else {
            panic!("Expected a call expression; Found {expr:?}");
        };
        assert!(outer_args.is_empty());
        let Expr::Prop(_, new_date_call, prop) = *outer_callee else {
            panic!("Expected a property expression; Found {outer_callee:?}");
        };
        assert!(prop.text == "getYear");
        let Expr::Call(_, new_date, two_args) = *new_date_call else {
            panic!("Expected a call expression; Found {new_date_call:?}");
        };
        let Expr::New(_, date) = *new_date else {
            panic!("Expected a new expression; Found {new_date:?}");
        };
        let Expr::Var(_, ident!("Date")) = *date else {
            panic!("Expected the expression 'Date'; Found {date:?}");
        };
        assert!(two_args.len() == 2);
        assert_matches!(&two_args[0], Expr::Number(..));
        assert_matches!(&two_args[1], Expr::Number(..));
    }

    #[test]
    fn parses_arrow_function_expr_without_param_parens() {
        let source = "x => x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        match expr {
            Expr::ArrowFn(_, params, _body) => {
                assert!(params.params.len() == 1);
                assert!(matches!(
                    params.params[0].pattern,
                    Pattern::Var(_, Ident { text: "x", .. })
                ));
            }
            e => panic!("Expected an arrow function expression; Found {e:?}"),
        }
    }

    #[test]
    fn parses_async_function_stmt() {
        let source = "async function foo() {}";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        match stmt {
            Stmt::FunctionDecl(_, f) => {
                assert!(f.name.map(|it| it.text) == Some("foo"));
                assert!(f.params.params.is_empty());
            }
            e => panic!("Expected a function statement; Found {e:?}"),
        }
    }

    #[test]
    fn test() {
        let source = r#"""
verifyProperty(Date.prototype, "toGMTString", {
  enumerable: false,
  writable: true,
  configurable: true,
});
        """#;
        let mut parser = Parser::new(source);
        parser.parse_stmt().unwrap();
    }

    #[test]
    fn parses_array_patterns() {
        let pattern = Parser::new("[x, y,]").parse_pattern().unwrap();
        let Pattern::Array(_, items) = pattern else {
            panic!("Expected an array pattern; Found {pattern:?}");
        };
        let [Some(Pattern::Var(_, ident!("x"))), Some(Pattern::Var(_, ident!("y")))] =
            items.as_slice()
        else {
            panic!("Expected [x, y,] to be parsed as [x, y]; Found {items:?}");
        };
    }

    #[test]
    fn parses_array_pattern_with_elision() {
        let pattern = Parser::new("[,]").parse_pattern().unwrap();
        let Pattern::Array(_, items) = pattern else {
            panic!("Expected an array pattern; Found {pattern:?}");
        };
        let [None] = items.as_slice() else {
            panic!("Expected [,] to be parsed as [None]; Found {items:?}");
        };
    }

    #[test]
    fn parses_array_pattern_with_elision_2() {
        let pattern = Parser::new("[,x]").parse_pattern().unwrap();
        let Pattern::Array(_, items) = pattern else {
            panic!("Expected an array pattern; Found {pattern:?}");
        };

        if let [None, Some(Pattern::Var(_, ident!("x")))] = items.as_slice() {
        } else {
            panic!("Expected [,x] to be parsed as None, Some(x); Found {items:?}");
        }
    }
}
