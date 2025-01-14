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
    Else,

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

    EndOfFile,
}
