use djs_syntax::Span;

#[derive(Debug)]
pub struct Stmt<'src> {
    pub span: Span,
    pub kind: StmtKind<'src>,
}

#[derive(Debug)]
pub enum StmtKind<'src> {
    Expr(Box<Expr<'src>>),
    Block(Block<'src>),
    Return(Option<Box<Expr<'src>>>),
}

#[derive(Debug)]
pub struct Expr<'src> {
    pub span: Span,
    pub kind: ExprKind<'src>,
}

#[derive(Debug)]
pub enum ExprKind<'src> {
    Var(&'src str),
    BinOp(Box<Expr<'src>>, BinOp, Box<Expr<'src>>),
    ArrowFn(ParamList<'src>, ExprOrBlock<'src>),
}

#[derive(Debug)]
pub struct ParamList<'src> {
    pub span: Span,
    pub params: Vec<Param<'src>>,
}

#[derive(Debug)]
pub enum ExprOrBlock<'src> {
    Expr(Box<Expr<'src>>),
    Block(Block<'src>),
}
impl ExprOrBlock<'_> {
    pub fn span(&self) -> Span {
        match self {
            ExprOrBlock::Expr(expr) => expr.span,
            ExprOrBlock::Block(block) => block.span,
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
