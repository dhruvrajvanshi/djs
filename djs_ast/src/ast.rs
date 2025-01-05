use djs_syntax::Span;

pub struct Stmt<'src> {
    pub span: Span,
    pub kind: StmtKind<'src>,
}
pub enum StmtKind<'src> {
    Expr(Box<Expr<'src>>),
    Block(Block<'src>),
    Return(Option<Box<Expr<'src>>>),
}

pub struct Expr<'src> {
    pub span: Span,
    pub kind: ExprKind<'src>,
}

pub enum ExprKind<'src> {
    Var(&'src str),
    BinOp(Box<Expr<'src>>, BinOp, Box<Expr<'src>>),
    ArrowFn(ParamList<'src>, ExprOrBlock<'src>),
}

pub struct ParamList<'src> {
    pub span: Span,
    pub params: Vec<Param<'src>>,
}
pub enum ExprOrBlock<'src> {
    Expr(Box<Expr<'src>>),
    Block(Block<'src>),
}
pub struct Block<'src> {
    pub span: Span,
    pub stmts: Vec<Stmt<'src>>,
}

pub struct Param<'src> {
    pub span: Span,
    pub name: &'src str,
}

pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
}
