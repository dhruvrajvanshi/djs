#![feature(box_patterns)]

mod lexer;
mod parser;
mod token;

pub use parser::{ParseError, Parser, Result};
