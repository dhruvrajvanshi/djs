use djs_parser::{lexer::Lexer, token::TokenKind};
use std::env::args;

fn main() {
    let args: Vec<String> = args().collect();
    match args.last() {
        None => {
            eprintln!("Usage: djs <source file>");
            std::process::exit(1);
        }
        Some(file) => {
            let source = std::fs::read_to_string(file).unwrap();
            let mut lexer = Lexer::new(&source);
            let mut current_token = lexer.next_token();
            loop {
                println!("{:?}", current_token);
                if current_token.kind == TokenKind::EndOfFile {
                    break;
                }
                current_token = lexer.next_token();
            }
        }
    }
}
