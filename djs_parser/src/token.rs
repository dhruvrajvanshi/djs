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
    New,
    In,
    Of,
    Instanceof,
    Yield,
    Async,
    Await,

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
    BangEq,
    BangEqEq,

    LessThan,
    LessThanEq,
    GreaterThan,
    GreaterThanEq,

    Plus,
    Minus,
    MinusMinus,
    PlusPlus,
    Star,
    Slash,

    VBar,
    VBarVBar,
    Amp,
    AmpAmp,
    Caret,

    EndOfFile,
}
