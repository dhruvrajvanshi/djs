use std::str::Chars;

mod token;

struct Lexer<'src> {
    input: Chars<'src>,
}

impl<'src> Lexer<'src> {
    pub fn new(input: &'src str) -> Self {
        Lexer {
            input: input.chars(),
        }
    }

    pub fn next_token(&mut self) -> token::Token<'src> {
        todo!()
    }
}

#[cfg(test)]
mod test {
    use crate::{token::TokenKind, Lexer};

    #[test]
    fn test_lexes_empty_file() {
        let mut lexer = Lexer::new("");
        assert_eq!(lexer.next_token().kind, TokenKind::EndOfFile);
    }
}
