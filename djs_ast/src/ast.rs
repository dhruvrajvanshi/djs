// This file is generated automatically
// python3 djs_ast/gen_ast.py > djs_ast/src/ast.rs && cargo fmt -- djs_ast/src/ast.rs
// DO NOT EDIT
use djs_syntax::Span;

pub type Ident<'src> = &'src str;

#[derive(Debug)]
pub struct SourceFile<'src> {
    pub span: Span,
    pub stmts: Vec<Stmt<'src>>,
}
impl SourceFile<'_> {
    pub fn span(&self) -> Span {
        self.span
    }
}

#[derive(Debug)]
pub enum Stmt<'src> {
    Expr(Span, Box<Expr<'src>>),
    Block(Span, Block<'src>),
    Return(Span, Option<Expr<'src>>),
    VarDecl(Span, DeclType, Ident<'src>, Option<Expr<'src>>),
}
impl Stmt<'_> {
    pub fn span(&self) -> Span {
        match self {
            Stmt::Expr(span, ..) => *span,
            Stmt::Block(span, ..) => *span,
            Stmt::Return(span, ..) => *span,
            Stmt::VarDecl(span, ..) => *span,
        }
    }
}

#[derive(Debug)]
pub enum Expr<'src> {
    Var(Span, Ident<'src>),
    BinOp(Span, Box<Expr<'src>>, BinOp, Box<Expr<'src>>),
    ArrowFn(Span, ParamList<'src>, ArrowFnBody<'src>),
    Call(Span, Box<Expr<'src>>, Vec<Expr<'src>>),
    Member(Span, Box<Expr<'src>>, Box<Expr<'src>>),
}
impl Expr<'_> {
    pub fn span(&self) -> Span {
        match self {
            Expr::Var(span, ..) => *span,
            Expr::BinOp(span, ..) => *span,
            Expr::ArrowFn(span, ..) => *span,
            Expr::Call(span, ..) => *span,
            Expr::Member(span, ..) => *span,
        }
    }
}

#[derive(Debug)]
pub struct ParamList<'src> {
    pub span: Span,
    pub params: Vec<Param<'src>>,
}
impl ParamList<'_> {
    pub fn span(&self) -> Span {
        self.span
    }
}

#[derive(Debug)]
pub enum ArrowFnBody<'src> {
    Expr(Span, Box<Expr<'src>>),
    Block(Span, Block<'src>),
}
impl ArrowFnBody<'_> {
    pub fn span(&self) -> Span {
        match self {
            ArrowFnBody::Expr(span, ..) => *span,
            ArrowFnBody::Block(span, ..) => *span,
        }
    }
}

#[derive(Debug)]
pub struct Block<'src> {
    pub span: Span,
    pub stmts: Vec<Stmt<'src>>,
}
impl Block<'_> {
    pub fn span(&self) -> Span {
        self.span
    }
}

#[derive(Debug)]
pub struct Param<'src> {
    pub span: Span,
    pub name: Ident<'src>,
}
impl Param<'_> {
    pub fn span(&self) -> Span {
        self.span
    }
}

#[derive(Debug)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Debug)]
pub enum DeclType {
    Let,
    Const,
    Var,
}
