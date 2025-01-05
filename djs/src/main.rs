use djs_parser::Parser;
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
            let mut parser = Parser::new(&source);
            println!("{:?}", parser.parse_source_file());
        }
    }
}
