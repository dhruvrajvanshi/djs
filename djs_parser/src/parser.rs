use std::mem;

use djs_ast::{
    AccessorType, ArrayLiteralMember, ArrowFnBody, AssignOp, BinOp, Block, Class, ClassBody,
    ClassMember, DeclType, Expr, For, ForInOrOf, ForInit, Function, Ident, InOrOf, MethodDef,
    ObjectKey, ObjectLiteralEntry, ObjectPattern, ObjectPatternProperty, Param, ParamList, Pattern,
    SourceFile, Stmt, SwitchCase, TemplateLiteralFragment, Text, TryStmt, VarDecl, VarDeclarator,
};
use djs_syntax::Span;

use crate::{
    lexer::{self, Lexer},
    token::{Token, TokenKind},
};

#[derive(Clone)]
pub struct Parser<'src> {
    lexer: Lexer<'src>,
    last_lexer: Lexer<'src>,
    last_token: Option<Token<'src>>,
    current_token: lexer::Result<Token<'src>>,
    expected: TokenKind,
}
pub type Result<T> = std::result::Result<T, Error>;

type T = TokenKind;

bitflags::bitflags! {
    struct PatternFlags: u8 {
        const NONE = 0;
        const ALLOW_ASSIGNMENT = 1 << 0;
        const ALLOW_SPREAD = 1 << 1;
    }
}

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
    GetterWithParams {
        line: u32,
        accessor_type: Option<AccessorType>,
    },
    Lexer(lexer::Error),
    Message(u32, &'static str),
}
impl Error {
    pub fn line(&self) -> u32 {
        match self {
            Error::UnexpectedToken { line, .. } => *line,
            Error::UnexpectedEOF(line) => *line,
            Error::MissingSemi { line, .. } => *line,
            Error::GetterWithParams { line, .. } => *line,
            Error::Lexer(e) => e.line(),
            Error::Message(line, _) => *line,
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
        let last_lexer = lexer.clone();
        let current_token = lexer.next_token();
        Parser {
            last_token: None,
            last_lexer,
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
        let stmts = self.parse_stmt_list(|t| matches!(t, T::RBrace))?;
        let stop = self.expect(T::RBrace)?.span;
        Ok(Block {
            span: Span::between(start, stop),
            stmts,
        })
    }
    fn parse_stmt_list(
        &mut self,
        end_token: impl Fn(TokenKind) -> bool,
    ) -> Result<Vec<Stmt<'src>>> {
        let mut stmts = vec![];
        while !end_token(self.current()?.kind) && self.current()?.kind != T::EndOfFile {
            let stmt = self.parse_stmt()?;
            stmts.push(stmt);
        }
        Ok(stmts)
    }

    fn parse_stmt(&mut self) -> Result<Stmt<'src>> {
        match self.current()?.kind {
            T::Let | T::Const | T::Var => {
                let decl = self.parse_var_decl()?;
                Ok(Stmt::VarDecl(decl))
            }
            T::If => self.parse_if_stmt(),
            T::Switch => self.parse_switch_stmt(),
            T::While => self.parse_while_stmt(),
            T::Do => self.parse_do_while_stmt(),
            T::Try => self.parse_try_stmt(),
            T::Return => self.parse_return_stmt(),
            T::Semi => {
                let tok = self.advance()?;
                Ok(Stmt::Empty(tok.span))
            }
            T::LBrace => self.parse_block().map(Stmt::Block),
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
                Ok(Stmt::FunctionDecl(f))
            }
            T::Class => {
                let c = self.parse_class()?;
                Ok(Stmt::ClassDecl(c))
            }
            T::Async => {
                if self.next_is(T::Function) {
                    self.advance()?;
                    let f = self.parse_function()?;
                    Ok(Stmt::FunctionDecl(f))
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
        let accessor_type = if self.current_matches(Token::is_get)
            && self.next_matches(Token::can_start_object_property_name)
        {
            self.advance()?;
            Some(AccessorType::Get)
        } else if self.current_matches(Token::is_set)
            && self.next_matches(Token::can_start_object_property_name)
        {
            self.advance()?;
            Some(AccessorType::Set)
        } else {
            None
        };
        let is_async = if self.current()?.kind == T::Async {
            self.advance()?;
            true
        } else {
            false
        };
        let is_generator = if self.current()?.kind == T::Star {
            self.advance()?;
            true
        } else {
            false
        };
        let name = self.parse_object_key()?;
        let start = static_token.map(|it| it.span).unwrap_or(name.span());
        let params = self.parse_params_with_parens()?;
        let body = self.parse_block()?;
        let span = Span::between(start, body.span);
        Ok(MethodDef {
            span,
            name,
            accessor_type,
            body: Function {
                span,
                name: None,
                params,
                body,
                is_generator,
                is_async,
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
        Ok(Stmt::ForInOrOf(ForInOrOf {
            span: Span::between(start, body.span()),
            in_or_of,
            decl_type,
            lhs,
            rhs,
            body,
        }))
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
        Ok(Stmt::For(For {
            span,
            init: init.unwrap_or(ForInit::Expr(Expr::Number(Text {
                span: first.span,
                text: "0",
            }))),
            test: cond,
            update,
            body,
        }))
    }

    fn parse_try_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::Try)?;
        let try_block = self.parse_block()?;
        let (catch_pattern, catch_block) = if self.current()?.kind == T::Catch {
            self.advance()?;
            if self.current()?.kind == T::LParen {
                self.advance()?;
                let name = self.parse_pattern()?;
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
        Ok(Stmt::Try(Box::new(TryStmt {
            span,
            try_block,
            catch_pattern,
            catch_block,
            finally_block,
        })))
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

    fn parse_switch_stmt(&mut self) -> Result<Stmt<'src>> {
        let start = self.expect(T::Switch)?.span;
        self.expect(T::LParen)?;
        let expr = self.parse_expr()?;
        self.expect(T::RParen)?;
        self.expect(T::LBrace)?;
        let mut cases = vec![];
        while !matches!(self.current()?.kind, T::RBrace | T::EndOfFile) {
            cases.push(self.parse_switch_case()?);
        }
        self.expect(T::RBrace)?;
        let end = self.current()?.span;
        Ok(Stmt::Switch(
            Span::between(start, end),
            Box::new(expr),
            cases,
        ))
    }
    fn parse_switch_case(&mut self) -> Result<SwitchCase<'src>> {
        match self.current()?.kind {
            T::Case => {
                let start = self.expect(T::Case)?;
                let expr = self.parse_expr()?;
                let colon = self.expect(T::Colon)?;
                let stmts =
                    self.parse_stmt_list(|t| matches!(t, T::Case | T::Default | T::RBrace))?;
                let end = stmts.last().map(Stmt::span).unwrap_or(colon.span);
                Ok(SwitchCase {
                    span: Span::between(start.span, end),
                    test: Some(expr),
                    body: stmts,
                })
            }
            _ => {
                let start = self.expect(T::Default)?.span;
                let colon = self.expect(T::Colon)?;
                let stmts =
                    self.parse_stmt_list(|t| matches!(t, T::Case | T::Default | T::RBrace))?;
                let end = stmts.last().map(Stmt::span).unwrap_or(colon.span);
                Ok(SwitchCase {
                    span: Span::between(start, end),
                    test: None,
                    body: stmts,
                })
            }
        }
    }

    fn parse_var_decl(&mut self) -> Result<VarDecl<'src>> {
        let mut span = self.current()?.span;
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
        let mut declarators = vec![self.parse_var_declarator()?];
        while self.at(T::Comma) {
            self.advance()?;
            declarators.push(self.parse_var_declarator()?);
        }
        // TODO: Include the initializer in the span
        span.end_with(declarators.last().unwrap().pattern.span());
        self.expect_semi()?;
        Ok(VarDecl {
            span,
            decl_type,
            declarators,
        })
    }

    fn parse_var_declarator(&mut self) -> Result<VarDeclarator<'src>> {
        let pattern = self.parse_pattern_with_precedence(
            !(PatternFlags::ALLOW_ASSIGNMENT | PatternFlags::ALLOW_SPREAD),
        )?;
        let init = if self.current()?.kind == T::Eq {
            self.advance()?;
            Some(self.parse_assignment_expr()?)
        } else {
            None
        };

        Ok(VarDeclarator { pattern, init })
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
        self.parse_pattern_with_precedence(PatternFlags::all())
    }

    fn parse_pattern_with_precedence(&mut self, flags: PatternFlags) -> Result<Pattern<'src>> {
        let head = match self.current()?.kind {
            T::Ident => {
                let ident = self.parse_binding_ident()?;
                Pattern::Var(ident)
            }
            T::DotDotDot if flags.contains(PatternFlags::ALLOW_SPREAD) => {
                self.advance()?;
                let pattern = self.parse_pattern_with_precedence(
                    !(PatternFlags::ALLOW_ASSIGNMENT | PatternFlags::ALLOW_SPREAD),
                )?;
                Pattern::Rest(Box::new(pattern))
            }
            T::LSquare => {
                let start = self.advance()?;
                let mut elements = vec![];
                loop {
                    match self.current()?.kind {
                        T::Comma if self.next_is(T::RSquare) && !elements.is_empty() => {
                            self.advance()?;
                            break;
                        }
                        T::RSquare | T::EndOfFile => {
                            break;
                        }
                        T::Comma => {
                            let span = self.advance()?.span;
                            elements.push(Pattern::Elision(span));
                        }
                        _ => {
                            elements.push(self.parse_pattern()?);
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
            T::LBrace => {
                let start = self.advance()?;
                let mut entries = vec![];
                let mut rest = None;
                loop {
                    match self.current()?.kind {
                        T::RBrace | T::EndOfFile => {
                            break;
                        }
                        T::DotDotDot => {
                            self.advance()?;
                            let rest_pattern = self.parse_pattern()?;
                            rest = Some(Box::new(rest_pattern));
                            if self.at(T::Comma) {
                                self.advance()?;
                                break;
                            } else {
                                break;
                            }
                        }
                        _ => {
                            let entry = self.parse_object_pattern_property()?;
                            entries.push(entry);
                            if self.at(T::RBrace) {
                                break;
                            }
                            self.expect(T::Comma)?;
                        }
                    }
                }
                let stop = self.expect(T::RBrace)?;
                let span = Span::between(start.span, stop.span);
                Pattern::Object(ObjectPattern {
                    span,
                    properties: entries,
                    rest,
                })
            }
            _ => self.unexpected_token()?,
        };
        match self.current()?.kind {
            T::Eq if flags.contains(PatternFlags::ALLOW_ASSIGNMENT) => {
                self.advance()?;
                let init = self.parse_assignment_expr()?;
                Ok(Pattern::Assignment(
                    Span::between(head.span(), init.span()),
                    Box::new(head),
                    Box::new(init),
                ))
            }
            _ => Ok(head),
        }
    }

    fn parse_object_pattern_property(&mut self) -> Result<ObjectPatternProperty<'src>> {
        let key = self.parse_object_key()?;
        let value = match (&key, self.current()?.kind) {
            (_, T::Colon) => {
                self.advance()?;
                self.parse_pattern()?
            }
            (ObjectKey::Ident(ident), _) => Pattern::Var(Ident {
                span: ident.span,
                text: ident.text,
            }),
            (ObjectKey::Computed(..) | ObjectKey::String(..), _) => {
                self.expect(T::Colon)?;
                self.parse_pattern()?
            }
        };
        Ok(ObjectPatternProperty {
            span: Span::between(key.span(), value.span()),
            key,
            value,
        })
    }

    fn parse_expr_stmt(&mut self) -> Result<Stmt<'src>> {
        let expr = self.parse_expr()?;
        self.expect_semi()?;
        Ok(Stmt::Expr(Box::new(expr)))
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
            T::Ident => Ok(Expr::Var(self.parse_ident()?)),
            T::True => Ok(Expr::Boolean(self.advance()?.span, true)),
            T::False => Ok(Expr::Boolean(self.advance()?.span, false)),
            T::Null => Ok(Expr::Null(self.advance()?.span)),
            T::Undefined => Ok(Expr::Undefined(self.advance()?.span)),
            T::String => {
                let tok = self.advance()?;
                Ok(Expr::String(Text {
                    span: tok.span,
                    text: tok.text,
                }))
            }
            T::Number => {
                let tok = self.advance()?;
                Ok(Expr::Number(Text {
                    span: tok.span,
                    text: tok.text,
                }))
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
                self.advance()?;
                if self.at(T::Function) {
                    let f = self.parse_function()?;
                    Ok(Expr::Function(f))
                } else {
                    self.parse_arrow_fn()
                }
            }
            T::Function => {
                let f = self.parse_function()?;
                Ok(Expr::Function(f))
            }
            T::Throw => {
                let start = self.advance()?.span;
                let expr = self.parse_expr()?;
                Ok(Expr::Throw(
                    Span::between(start, expr.span()),
                    Box::new(expr),
                ))
            }
            T::LSquare => {
                let start = self.advance()?;
                let mut elements = vec![];
                loop {
                    match self.current()?.kind {
                        T::Comma if self.next_is(T::RSquare) && !elements.is_empty() => {
                            self.advance()?;
                            break;
                        }
                        T::RSquare | T::EndOfFile => {
                            break;
                        }
                        T::DotDotDot => {
                            self.advance()?;
                            elements
                                .push(ArrayLiteralMember::Spread(self.parse_assignment_expr()?));
                            if self.at(T::RSquare) {
                                break;
                            }
                            self.expect(T::Comma)?;
                        }
                        T::Comma => {
                            let span = self.advance()?.span;
                            elements.push(ArrayLiteralMember::Elision(span));
                        }
                        _ => {
                            elements.push(ArrayLiteralMember::Expr(self.parse_assignment_expr()?));
                            if self.at(T::RSquare) {
                                break;
                            }
                            self.expect(T::Comma)?;
                        }
                    }
                }
                let end = self.expect(T::RSquare)?;
                Ok(Expr::Array(Span::between(start.span, end.span), elements))
            }
            T::Slash => {
                self.re_lex_regex()?;
                let tok = self.expect(T::Regex)?;
                Ok(Expr::Regex(Text {
                    span: tok.span,
                    text: tok.text,
                }))
            }
            T::Super => Ok(Expr::Super(self.advance()?.span)),
            T::Class => {
                let cls = self.parse_class()?;
                Ok(Expr::Class(Box::new(cls)))
            }
            T::TemplateLiteralFragment => self.parse_template_literal(),
            _ => self.unexpected_token(),
        }
    }

    fn parse_template_literal(&mut self) -> Result<Expr<'src>> {
        let mut span = self.current()?.span;
        let mut fragments = vec![];
        loop {
            match self.current()?.kind {
                T::TemplateLiteralFragment => {
                    let tok = self.advance()?;
                    fragments.push(TemplateLiteralFragment::Text(Text {
                        text: tok.text,
                        span: tok.span,
                    }));
                    if tok.text.ends_with("${") {
                        self.lexer.start_template_literal_interpolation();
                        let expr = self.parse_expr()?;
                        fragments.push(TemplateLiteralFragment::Expr(expr));
                        self.lexer.end_template_literal_interpolation();
                    } else if tok.text.ends_with("`") {
                        span.end_with(tok.span);
                        break;
                    }
                }
                _ => {
                    return Err(Error::UnexpectedEOF(self.current_line()));
                }
            }
        }
        Ok(Expr::TemplateLiteral(span, fragments))
    }

    fn re_lex_regex(&mut self) -> Result<()> {
        let mut last_lexer = self.last_lexer.clone();
        last_lexer.enable_regex();
        self.current_token = last_lexer.next_token();
        last_lexer.disable_regex();
        assert!(self.current()?.kind == T::Regex);
        self.lexer = last_lexer;
        Ok(())
    }

    fn peek(&self) -> Option<Token<'src>> {
        let mut clone = self.lexer.clone();
        clone.next_token().map(Some).unwrap_or(None)
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
        let params = self.parse_params_with_parens()?;
        let body = self.parse_block()?;
        let span = Span::between(start.span, body.span());
        let f = Function {
            span,
            name,
            params,
            body,
            is_generator,
            is_async: false,
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
        match self.current()?.kind {
            T::DotDotDot => {
                self.advance()?;
                let expr = self.parse_assignment_expr()?;
                Ok(ObjectLiteralEntry::Spread(expr))
            }
            T::Ident if self.next_is(T::Comma) || self.next_is(T::RBrace) => {
                let ident = self.parse_ident()?;
                Ok(ObjectLiteralEntry::Ident(ident))
            }
            T::Ident
                if self.current_matches(Token::is_accessor_type)
                    && self.next_matches(Token::can_start_object_property_name) =>
            {
                self.parse_object_literal_entry_method()
            }
            T::Async if self.next_is(T::Star) => self.parse_object_literal_entry_method(),
            T::Ident if self.next_is(T::LParen) => self.parse_object_literal_entry_method(),
            T::Star => self.parse_object_literal_entry_method(),
            T::Async
                if self.next_is(T::Ident)
                    || self.next_is(T::LSquare)
                    || self.peek().map(|it| it.kind.is_keyword()).unwrap_or(false) =>
            {
                self.parse_object_literal_entry_method()
            }

            _ => {
                let start = self.current()?.span;
                let name = self.parse_object_key()?;
                match self.current()?.kind {
                    T::LParen => {
                        let params = self.parse_params_with_parens()?;
                        let body = self.parse_block()?;
                        let span = Span::between(start, body.span);
                        let method = MethodDef {
                            span,
                            name,
                            accessor_type: None,
                            body: Function {
                                span,
                                name: None,
                                params,
                                body,
                                is_generator: false,
                                is_async: false,
                            },
                        };
                        Ok(ObjectLiteralEntry::Method(method))
                    }
                    _ => {
                        self.expect(T::Colon)?;
                        let expr = self.parse_assignment_expr()?;
                        Ok(ObjectLiteralEntry::Prop(
                            Span::between(start, expr.span()),
                            name,
                            expr,
                        ))
                    }
                }
            }
        }
    }
    fn next_matches(&self, predicate: impl Fn(&Token<'src>) -> bool) -> bool {
        let Some(next) = self.peek() else {
            return false;
        };
        predicate(&next)
    }

    fn current_matches(&self, predicate: impl Fn(&Token<'src>) -> bool) -> bool {
        let Ok(current) = self.current() else {
            return false;
        };
        predicate(current)
    }

    fn parse_object_literal_entry_method(&mut self) -> Result<ObjectLiteralEntry<'src>> {
        let start = self.current()?.span;
        let line = self.current_line();
        let accessor_type = if self.current_matches(Token::is_get)
            && self.next_matches(Token::can_start_object_property_name)
        {
            self.advance()?;
            Some(AccessorType::Get)
        } else if self.current_matches(Token::is_set)
            && self.next_matches(Token::can_start_object_property_name)
        {
            self.advance()?;
            Some(AccessorType::Set)
        } else {
            None
        };
        let is_async = if self.at(T::Async) {
            self.advance()?;
            true
        } else {
            false
        };
        let is_generator = self.at(T::Star);
        if is_generator {
            self.advance()?;
        }
        let name = self.parse_object_key()?;
        let params = self.parse_params_with_parens()?;
        let body = self.parse_block()?;
        let span = Span::between(start, body.span);

        if let Some(AccessorType::Get) = accessor_type {
            if !params.params.is_empty() {
                return Err(Error::GetterWithParams {
                    line,
                    accessor_type,
                });
            }
        }
        let method = MethodDef {
            span,
            name,
            accessor_type,
            body: Function {
                span,
                name: None,
                params,
                body,
                is_generator,
                is_async,
            },
        };
        Ok(ObjectLiteralEntry::Method(method))
    }

    fn parse_object_key(&mut self) -> Result<ObjectKey<'src>> {
        Ok(match self.current()?.kind {
            T::String => {
                let tok = self.advance()?;
                ObjectKey::String(Text {
                    span: tok.span,
                    text: tok.text,
                })
            }
            T::Number => {
                let tok = self.advance()?;
                ObjectKey::String(Text {
                    span: tok.span,
                    text: tok.text,
                })
            }
            T::LSquare => {
                self.advance()?;
                let expr = self.parse_expr()?;
                self.expect(T::RSquare)?;
                ObjectKey::Computed(expr)
            }
            _ => ObjectKey::Ident(self.parse_member_ident_name()?),
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
                    let mut is_yield_from = false;
                    if self.at(T::Star) {
                        self.advance()?;
                        is_yield_from = true;
                    }
                    let expr = self.parse_assignment_expr()?;
                    let span = Span::between(start.span, expr.span());
                    if is_yield_from {
                        Ok(Expr::YieldFrom(span, Box::new(expr)))
                    } else {
                        Ok(Expr::Yield(span, Some(Box::new(expr))))
                    }
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
                let lhs = self.parse_conditional_expr()?;
                if let Some(assign_op) = assign_op(self.current()?.kind) {
                    let Some(lhs) = expr_to_pattern(&lhs) else {
                        return Err(Error::Message(
                            self.current_line(),
                            "Invalid left-hand side in assignment",
                        ));
                    };
                    self.advance()?;
                    let rhs = self.parse_assignment_expr()?;
                    let span = Span::between(lhs.span(), rhs.span());
                    Ok(Expr::Assign(span, Box::new(lhs), assign_op, Box::new(rhs)))
                } else {
                    Ok(lhs)
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

    define_binop_parser!(
        parse_shift_expr,
        parse_additive_expr,
        T::LessThanLessThan | T::GreaterThanGreaterThan | T::GreaterThanGreaterThanGreaterThan
    );

    define_binop_parser!(
        parse_additive_expr,
        parse_multiplicative_expr,
        T::Plus | T::Minus
    );

    define_binop_parser!(
        parse_multiplicative_expr,
        parse_exponentiation_expr,
        T::Star | T::Slash | T::Percent
    );

    fn parse_exponentiation_expr(&mut self) -> Result<Expr<'src>> {
        // TODO
        self.parse_unary_expr()
    }

    fn parse_unary_expr(&mut self) -> Result<Expr<'src>> {
        macro_rules! make_unary {
            ($case: ident) => {{
                let start = self.advance()?.span;
                let expr = self.parse_unary_expr()?;
                Ok(Expr::$case(
                    Span::between(start, expr.span()),
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
                let start = self.advance()?.span;
                let expr = self.parse_unary_expr()?;
                return Ok(Expr::PreDecrement(
                    Span::between(start, expr.span()),
                    Box::new(expr),
                ));
            }
            _ => {}
        }
        let lhs = self.parse_left_hand_side_expr()?;
        if self.at(T::PlusPlus) && !self.current_is_on_new_line() {
            let end = self.advance()?;
            Ok(Expr::PostIncrement(
                Span::between(lhs.span(), end.span),
                Box::new(lhs),
            ))
        } else if self.at(T::MinusMinus) && !self.current_is_on_new_line() {
            let end = self.advance()?;

            Ok(Expr::PostDecrement(
                Span::between(lhs.span(), end.span),
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
                Expr::New(Span::between(start.span, expr.span()), Box::new(expr))
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
        let params = self.parse_params_with_parens()?;
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
                Ok(ArrowFnBody::Block(Block { span, stmts }))
            }
            _ => Ok(ArrowFnBody::Expr(Box::new(self.parse_expr()?))),
        }
    }

    fn parse_params_with_parens(&mut self) -> Result<ParamList<'src>> {
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
        self.last_lexer = self.lexer.clone();
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
        T::Percent => BinOp::Mod,
        T::In => BinOp::In,
        T::Instanceof => BinOp::Instanceof,
        T::AmpAmp => BinOp::And,
        T::VBarVBar => BinOp::Or,
        T::VBar => BinOp::BitOr,
        T::Caret => BinOp::BitXor,
        T::Amp => BinOp::BitAnd,
        T::LessThanLessThan => BinOp::LeftShift,
        T::GreaterThanGreaterThan => BinOp::RightShift,
        T::GreaterThanGreaterThanGreaterThan => BinOp::UnsignedRightShift,

        k => panic!("Invalid operator {k:?}"),
    }
}

fn obj_literal_to_pattern<'s>(
    span: Span,
    entries: &[ObjectLiteralEntry<'s>],
) -> Option<Pattern<'s>> {
    let mut properties = vec![];
    let mut rest = None;
    for (index, entry) in entries.iter().enumerate() {
        match entry {
            ObjectLiteralEntry::Ident(ident) => {
                properties.push(ObjectPatternProperty {
                    span: ident.span,
                    key: ObjectKey::Ident(ident.clone()),
                    value: Pattern::Var(ident.clone()),
                });
            }

            // { key: value }
            ObjectLiteralEntry::Prop(span, key, value) => {
                properties.push(ObjectPatternProperty {
                    span: *span,
                    key: key.clone(),
                    value: expr_to_pattern(value)?,
                });
            }
            ObjectLiteralEntry::Spread(expr) => {
                if index != entries.len() - 1 {
                    return None;
                }
                rest = Some(Box::new(expr_to_pattern(expr)?));
            }
            ObjectLiteralEntry::Method(..) => {
                return None;
            }
        }
    }
    Some(Pattern::Object(ObjectPattern {
        span,
        properties,
        rest,
    }))
}
fn array_literal_to_pattern<'s>(
    span: Span,
    items: &[ArrayLiteralMember<'s>],
) -> Option<Pattern<'s>> {
    let mut members = vec![];
    for items in items {
        match items {
            ArrayLiteralMember::Elision(span) => {
                members.push(Pattern::Elision(*span));
            }
            ArrayLiteralMember::Expr(expr) => {
                let expr = expr_to_pattern(expr)?;
                members.push(expr);
            }
            ArrayLiteralMember::Spread(expr) => {
                let expr = expr_to_pattern(expr)?;
                members.push(Pattern::Rest(Box::new(expr)));
            }
        }
    }
    Some(Pattern::Array(span, members))
}

fn expr_to_pattern<'src>(expr: &Expr<'src>) -> Option<Pattern<'src>> {
    match expr {
        Expr::Var(ident) => Some(Pattern::Var(ident.clone())),
        Expr::Object(span, obj) => obj_literal_to_pattern(*span, obj),
        Expr::Array(span, items) => array_literal_to_pattern(*span, items),
        Expr::Prop(span, lhs, member) => Some(Pattern::Prop(
            *span,
            Box::new(*lhs.clone()),
            ObjectKey::Ident(member.clone()),
        )),
        Expr::Index(span, lhs, index) => Some(Pattern::Prop(
            *span,
            Box::new(*lhs.clone()),
            ObjectKey::Computed(*index.clone()),
        )),
        _ => None,
    }
}

fn assign_op(kind: TokenKind) -> Option<AssignOp> {
    match kind {
        T::Eq => Some(AssignOp::Eq),
        T::PlusEq => Some(AssignOp::AddEq),
        T::MinusEq => Some(AssignOp::SubEq),
        T::StarEq => Some(AssignOp::MulEq),
        T::PercentEq => Some(AssignOp::DivEq),
        T::SlashEq => Some(AssignOp::DivEq),
        T::AmpEq => Some(AssignOp::BitAndEq),
        T::BarEq => Some(AssignOp::BitOrEq),
        T::CaretEq => Some(AssignOp::BitXorEq),
        T::LessThanEq => Some(AssignOp::LeftShiftEq),
        T::GreaterThanGreaterThanEq => Some(AssignOp::RightShiftEq),
        T::GreaterThanGreaterThanGreaterThanEq => Some(AssignOp::UnsignedRightShiftEq),
        T::StarStarEq => Some(AssignOp::ExponentEq),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use core::panic;
    use std::{
        collections::HashSet,
        env,
        fs::File,
        io::{Read, Write},
    };

    use djs_ast::{Expr, ObjectPattern};

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
            Expr::Var(ident!($value))
        };
    }

    #[test]
    fn test_parse_var_expr() {
        let source = "x";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(Ident { text: "x", .. })));
    }

    #[test]
    fn should_parse_parenthesized_expr() {
        let source = "(x)";
        let mut parser = Parser::new(source);
        let expr = parser.parse_expr().unwrap();
        assert!(matches!(expr, Expr::Var(ident!("x"))));
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

        let Stmt::Expr(x) = &source_file.stmts[0] else {
            panic!("Expected an expression statement")
        };
        let exp_var!("x") = **x else {
            panic!("Expected a variable expression")
        };
        let Stmt::Expr(y) = &source_file.stmts[1] else {
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
        let Expr::ArrowFn(_, _, ArrowFnBody::Block(block)) = expr else {
            panic!("Expected an arrow fn expression")
        };
        let [Stmt::Expr(first_stmt), Stmt::Expr(second_stmt)] = block.stmts.as_slice() else {
            panic!("Expected 2 statements in the block")
        };
        assert!(matches!(**first_stmt, exp_var!("x")));
        assert!(matches!(**second_stmt, exp_var!("y")));
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
        let mut successful_results = vec![];
        let mut unsuccessful_results = vec![];

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
            let path = entry.to_str().unwrap();
            eprintln!("Parsing {path}...");
            let result = parser.parse_source_file();
            match result {
                Ok(..) => {
                    if expected_parse_error {
                        eprintln!(
                            "{path}: Expected a parse error but the file was parsed successfully"
                        );
                        unsuccessful_results.push(entry);
                    } else {
                        successful_results.push(entry);
                    }
                }
                Err(e) => {
                    if expected_parse_error {
                        successful_results.push(entry);
                    } else {
                        let line = e.line();
                        eprintln!(
                            "{path}:{line}: Expected a successful parse but failed with {e:?}"
                        );
                        unsuccessful_results.push(entry);
                    }
                }
            }
        }
        if env::var("UPDATE_BASELINE").is_ok() {
            println!("Updating baseline...");
            let mut file = File::create("test_262_baseline.success.txt").unwrap();
            for entry in successful_results {
                writeln!(file, "{}", entry.to_str().unwrap()).unwrap();
            }
            let mut file = File::create("test_262_baseline.failed.txt").unwrap();
            for entry in unsuccessful_results {
                writeln!(file, "{}", entry.to_str().unwrap()).unwrap();
            }
        } else {
            let mut baseline_success = String::new();
            let mut baseline_failures = String::new();
            File::open("test_262_baseline.success.txt")
                .unwrap()
                .read_to_string(&mut baseline_success)
                .unwrap();
            File::open("test_262_baseline.failed.txt")
                .unwrap()
                .read_to_string(&mut baseline_failures)
                .unwrap();

            let successful_results = successful_results
                .iter()
                .map(|entry| entry.to_str().unwrap())
                .collect::<HashSet<&str>>();
            let unsuccessful_results = unsuccessful_results
                .iter()
                .map(|entry| entry.to_str().unwrap())
                .collect::<HashSet<&str>>();
            let baseline_success = baseline_success.lines().collect::<HashSet<&str>>();
            let baseline_failures = baseline_failures.lines().collect::<HashSet<&str>>();

            for entry in successful_results.difference(&baseline_success) {
                eprintln!("✅ {}", entry);
            }
            for entry in unsuccessful_results.difference(&baseline_failures) {
                eprintln!("🛑 {}", entry);
            }

            if successful_results.len() > baseline_success.len() {
                let new_successes = successful_results.len() - baseline_success.len();
                eprintln!("🎉 {new_successes} case(s) now pass; You can update the baseline by running UPDATE_BASELINE=true cargo test");
            }

            assert_eq!(successful_results.len(), baseline_success.len());
        }
    }

    fn syntax_error_expected(s: &str) -> bool {
        let frontmatter = frontmatter(s);
        let is_negative = frontmatter.contains("negative:");
        //  phase: parse
        //  type: SyntaxError
        let syntax_error_expected =
            frontmatter.contains("phase: parse") && frontmatter.contains("type: SyntaxError");
        is_negative && syntax_error_expected
    }
    fn frontmatter(s: &str) -> &str {
        let Some(frontmatter_start) = s.find("/*---") else {
            return "";
        };
        let Some(frontmatter_end) = s.find("---*/") else {
            return "";
        };
        &s[frontmatter_start..frontmatter_end]
    }

    #[test]
    fn parses_try_catch() {
        let source = "try { x; } catch (e) { y; } finally { z; }";
        let mut parser = Parser::new(source);
        let stmt = parser.parse_stmt().unwrap();
        let Stmt::Try(try_stmt) = stmt else {
            panic!("Expected a try statement");
        };
        let TryStmt {
            try_block,
            catch_pattern,
            catch_block,
            finally_block,
            ..
        } = *try_stmt;
        assert!(matches!(catch_pattern, Some(..)));
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
            Stmt::For(For {
                init:
                    ForInit::VarDecl(VarDecl {
                        decl_type: DeclType::Let,
                        declarators,
                        ..
                    }),
                test,
                update,
                body,
                ..
            }) => {
                let [VarDeclarator { pattern, init }] = declarators.as_slice() else {
                    panic!("Expected a declarator in the for loop");
                };
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
            Stmt::Expr(e) => {
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
        let Stmt::Expr(e) = stmt else {
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
            Stmt::ForInOrOf(ForInOrOf {
                decl_type: Some(DeclType::Let),
                lhs: Pattern::Var(ident!("x")),
                rhs: Expr::Var(ident!("y")),
                body,
                ..
            }) => {
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
        let Expr::Var(ident!("Date")) = *date else {
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
                    Pattern::Var(Ident { text: "x", .. })
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
            Stmt::FunctionDecl(f) => {
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
        let [Pattern::Var(ident!("x")), Pattern::Var(ident!("y"))] = items.as_slice() else {
            panic!("Expected [x, y,] to be parsed as [x, y]; Found {items:?}");
        };
    }

    #[test]
    fn parses_array_pattern_with_elision() {
        let pattern = Parser::new("[,]").parse_pattern().unwrap();
        let Pattern::Array(_, items) = pattern else {
            panic!("Expected an array pattern; Found {pattern:?}");
        };
        let [Pattern::Elision(_)] = items.as_slice() else {
            panic!("Expected [,] to be parsed as [None]; Found {items:?}");
        };
    }

    #[test]
    fn parses_array_pattern_with_elision_2() {
        let pattern = Parser::new("[,x]").parse_pattern().unwrap();
        let Pattern::Array(_, items) = pattern else {
            panic!("Expected an array pattern; Found {pattern:?}");
        };

        if let [Pattern::Elision(_), Pattern::Var(ident!("x"))] = items.as_slice() {
        } else {
            panic!("Expected [,x] to be parsed as None, Some(x); Found {items:?}");
        }
    }

    #[test]
    fn parses_empty_object_pattern() {
        let pattern = Parser::new("{}").parse_pattern().unwrap();
        let Pattern::Object(ObjectPattern {
            properties,
            rest: None,
            ..
        }) = pattern
        else {
            panic!("Expected an object pattern; Found {pattern:?}");
        };
        assert!(properties.is_empty());
    }

    #[test]
    fn parses_object_pattern_with_one_property() {
        let pattern = Parser::new("{ x }").parse_pattern().unwrap();
        let Pattern::Object(ObjectPattern {
            properties,
            rest: None,
            ..
        }) = pattern
        else {
            panic!("Expected an object pattern; Found {pattern:?}");
        };
        let [ObjectPatternProperty { key, value, .. }] = properties.as_slice() else {
            panic!("Expected {{ x }} to be parsed correctly; Found {properties:?}");
        };
        assert_matches!(key, ObjectKey::Ident(.., ident!("x")));
        assert_matches!(value, Pattern::Var(.., ident!("x")));
    }

    #[test]
    fn parses_object_pattern_nested() {
        let pattern = Parser::new("{ x: { y } }").parse_pattern().unwrap();
        let Pattern::Object(pattern) = pattern else {
            panic!("Expected an object pattern; Found {pattern:?}");
        };
        let [ObjectPatternProperty { key, value, .. }] = pattern.properties.as_slice() else {
            panic!("Expected {{ x: {{ y }} }} to be parsed correctly; Found {pattern:?}");
        };
        assert_matches!(key, ObjectKey::Ident(.., ident!("x")));
        let Pattern::Object(ObjectPattern {
            properties: inner_props,
            ..
        }) = value
        else {
            panic!("Expected {{ y }} to be parsed correctly; Found {value:?}");
        };
        let [ObjectPatternProperty { key, .. }] = inner_props.as_slice() else {
            panic!("Expected {{ y }} to be parsed correctly; Found {inner_props:?}");
        };
        assert_matches!(key, ObjectKey::Ident(.., ident!("y")));
    }

    #[test]
    fn parses_rest_pattern_in_object() {
        let pattern = Parser::new("{ x, ...y }").parse_pattern().unwrap();
        let Pattern::Object(ObjectPattern {
            properties,
            rest: Some(rest),
            ..
        }) = pattern
        else {
            panic!("Expected an object pattern; Found {pattern:?}");
        };
        let [ObjectPatternProperty { key, .. }] = properties.as_slice() else {
            panic!("Expected {{ x, ...y }} to be parsed correctly; Found {properties:?}");
        };
        let rest = *rest;
        assert_matches!(key, ObjectKey::Ident(.., ident!("x")));
        assert_matches!(rest, Pattern::Var(ident!("y")));
    }

    #[test]
    fn parses_conditional_with_assignment_on_rhs() {
        let expr = Parser::new("x ? y : z = a").parse_expr().unwrap();
        let Expr::Ternary(_, _, _, alt) = expr else {
            panic!("Expected a ternary expression; Found {expr:?}");
        };
        let Expr::Assign(_, z, AssignOp::Eq, a) = *alt else {
            panic!("Expected z = a to be parsed as an assignment; Found {alt:?}");
        };
        assert_matches!(*z, Pattern::Var(.., ident!("z")));
        assert_matches!(*a, Expr::Var(.., ident!("a")));
    }

    #[test]
    fn switch_case_smoke_test() {
        Parser::new("switch(foo) {}").parse_stmt().unwrap();
        Parser::new(
            "
            switch(foo) {
                case 1: bar;
            }
        ",
        )
        .parse_stmt()
        .unwrap();
    }

    #[test]
    fn should_allow_a_method_named_get_in_object_literals() {
        Parser::new("({ get() {} })").parse_expr().unwrap();
    }

    #[test]
    fn regex() {
        Parser::new("f(1 / 2, ' / ')").parse_expr().unwrap();
    }
}
