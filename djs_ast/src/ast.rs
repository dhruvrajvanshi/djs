use djs_syntax::Span;

#[derive(Debug)]
pub struct SourceFile<'src> {
    pub span: Span,
    pub stmts: Vec<Stmt<'src>>,
}

#[derive(Debug)]
pub enum Stmt<'src> {
    Expr(Span, Box<Expr<'src>>),
    Block(Span, Block<'src>),
    Return(Span, Option<Box<Expr<'src>>>),
}

#[derive(Debug)]
pub enum Expr<'src> {
    Var(Span, &'src str),
    BinOp(Span, Box<Expr<'src>>, BinOp, Box<Expr<'src>>),
    ArrowFn(Span, ParamList<'src>, ArrowFnBody<'src>),
    Call(Span, Box<Expr<'src>>, Vec<Expr<'src>>),
    Member(Span, Box<Expr<'src>>, Box<Expr<'src>>),
}
impl Expr<'_> {
    pub fn span(&self) -> Span {
        match self {
            Expr::Var(span, _) => *span,
            Expr::BinOp(span, _, _, _) => *span,
            Expr::ArrowFn(span, _, _) => *span,
            Expr::Call(span, _, _) => *span,
            Expr::Member(span, _, _) => *span,
        }
    }
}

#[derive(Debug)]
pub struct ParamList<'src> {
    pub span: Span,
    pub params: Vec<Param<'src>>,
}

#[derive(Debug)]
pub enum ArrowFnBody<'src> {
    Expr(Box<Expr<'src>>),
    Block(Block<'src>),
}
impl ArrowFnBody<'_> {
    pub fn span(&self) -> Span {
        match self {
            ArrowFnBody::Expr(expr) => expr.span(),
            ArrowFnBody::Block(block) => block.span,
        }
    }
}

#[derive(Debug)]
pub struct Block<'src> {
    pub span: Span,
    pub stmts: Vec<Stmt<'src>>,
}

#[derive(Debug)]
pub struct Param<'src> {
    pub span: Span,
    pub name: &'src str,
}

#[derive(Debug)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
}
