use djs_syntax::Span;

#[derive(Debug, Clone, Copy)]
pub struct Token<'src> {
    pub kind: TokenKind,
    pub span: Span,
    pub text: &'src str,
    pub line: u32,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum TokenKind {
    Ident,
    Let,
    Var,
    Const,
    If,
    While,
    Else,
    Function,
    Try,
    Catch,
    Finally,
    Throw,
    Return,
    For,

    String,
    Number,

    LBrace,
    RBrace,
    LParen,
    RParen,
    LSquare,
    RSquare,
    Comma,
    Colon,
    Dot,
    Semi,

    FatArrow,
    Eq,
    EqEq,
    EqEqEq,

    LessThan,
    LessThanEq,
    GreaterThan,
    GreaterThanEq,

    Plus,
    PlusPlus,

    EndOfFile,
}
