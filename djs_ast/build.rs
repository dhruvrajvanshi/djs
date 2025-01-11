use core::panic;
use std::{fs, path::Path, process::Command};

fn main() {
    let gen_ast_result = Command::new("python3")
        .args(["gen_ast.py"])
        .output()
        .unwrap();

    fs::write(Path::new("src").join("ast.rs"), gen_ast_result.stdout).unwrap();
    if !gen_ast_result.status.success() {
        fs::write(Path::new("gen_ast.py.stderr"), gen_ast_result.stderr).unwrap();
    }

    let gen_visitor_result = Command::new("python3")
        .args(["gen_visitor.py"])
        .output()
        .unwrap();

    fs::write(
        Path::new("src").join("visitor.rs"),
        gen_visitor_result.stdout,
    )
    .unwrap();
    if !gen_visitor_result.status.success() {
        fs::write(
            Path::new("gen_visitor.py.stderr"),
            gen_visitor_result.stderr,
        )
        .unwrap();
    }

    if !gen_ast_result.status.success() || !gen_visitor_result.status.success() {
        panic!("gen_ast or gen_visitor failed; See gen*.py.stderr")
    }

    assert!(Command::new("cargo")
        .args(["fmt", "--", "src/visitor.rs"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("cargo")
        .args(["fmt", "--", "src/ast.rs"])
        .status()
        .unwrap()
        .success());

    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=gen_ast.py");
    println!("cargo::rerun-if-changed=gen_visitor.py");
    println!("cargo::rerun-if-changed=src/js_ast.py");
}
