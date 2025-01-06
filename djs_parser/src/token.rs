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
    LBrace,
    RBrace,

    LParen,
    RParen,
    LSquare,
    RSquare,
    Comma,
    Semi,

    FatArrow,

    EndOfFile,
}
