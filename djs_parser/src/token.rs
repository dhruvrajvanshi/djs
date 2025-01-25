pub use djs_ast::TokenKind;
use djs_syntax::Span;

#[derive(Debug, Clone, Copy)]
pub struct Token<'src> {
    pub kind: TokenKind,
    pub span: Span,
    pub text: &'src str,
    pub line: u32,
}

impl Token<'_> {
    pub fn is_get(&self) -> bool {
        self.kind == TokenKind::Ident && self.text == "get"
    }
    pub fn is_set(&self) -> bool {
        self.kind == TokenKind::Ident && self.text == "set"
    }

    pub fn is_accessor_type(&self) -> bool {
        self.is_get() || self.is_set()
    }

    pub fn is_valid_property_name(&self) -> bool {
        self.kind == TokenKind::Ident || self.kind.is_keyword()
    }

    pub fn can_start_object_property_name(&self) -> bool {
        self.is_valid_property_name()
            || self.kind == TokenKind::LSquare
            || self.kind == TokenKind::String
    }
}
