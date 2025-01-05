use djs_syntax::Span;

pub struct Stmt<'src> {
    pub span: Span,
    pub kind: StmtKind<'src>,
}
pub enum StmtKind<'src> {
    Expr(Box<Expr<'src>>),
    Block(Vec<Stmt<'src>>),
    Return(Option<Box<Expr<'src>>>),
}

pub struct Expr<'src> {
    pub span: Span,
    pub kind: ExprKind<'src>,
}

pub enum ExprKind<'src> {
    Var(&'src str),
    BinOp(Box<Expr<'src>>, BinOp, Box<Expr<'src>>),
}
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
}
