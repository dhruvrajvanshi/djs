use djs_syntax::Span;

#[derive(Debug)]
pub struct Token<'src> {
    pub kind: TokenKind,
    pub span: Span,
    pub text: &'src str,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TokenKind {
    Ident,
    LBrace,
    RBrace,

    LParen,
    RParen,

    EndOfFile,
}
