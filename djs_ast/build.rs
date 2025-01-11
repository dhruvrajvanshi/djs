use core::panic;
use std::{env, fs, path::Path, process::Command};

fn main() {
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let ast_rs = Path::new(&out_dir).join("ast.rs");
    let gen_ast_result = Command::new("python3")
        .args(["gen_ast.py"])
        .output()
        .unwrap();

    fs::write(Path::new(&out_dir).join("ast.rs"), gen_ast_result.stdout).unwrap();
    if !gen_ast_result.status.success() {
        fs::write(Path::new("gen_ast.py.stderr"), gen_ast_result.stderr).unwrap();
    }

    let gen_visitor_result = Command::new("python3")
        .args(["gen_visitor.py"])
        .output()
        .unwrap();

    let visitor_rs = Path::new(&out_dir).join("visitor.rs");
    fs::write(&visitor_rs, gen_visitor_result.stdout).unwrap();
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
        .args(["fmt", "--", visitor_rs.to_str().unwrap()])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("cargo")
        .args(["fmt", "--", ast_rs.to_str().unwrap()])
        .status()
        .unwrap()
        .success());

    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=gen_ast.py");
    println!("cargo::rerun-if-changed=gen_visitor.py");
    println!("cargo::rerun-if-changed=src/js_ast.py");
}
