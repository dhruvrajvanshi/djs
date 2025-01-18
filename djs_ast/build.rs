use std::{
    env,
    fs::File,
    path::Path,
    process::{Command, Stdio},
};

fn main() {
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let ast_rs = Path::new(&out_dir).join("ast.rs");
    let mut gen_ast_result = Command::new("node")
        .args(["./gen_ast.js"])
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();

    gen_ast_result.wait().unwrap();
    assert!(Command::new("rustfmt")
        .stdin(Stdio::from(gen_ast_result.stdout.unwrap()))
        .stdout(File::create(&ast_rs).unwrap())
        .stderr(Stdio::inherit())
        .status()
        .unwrap()
        .success());

    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=src/ast.js");
    println!("cargo::rerun-if-changed=gen_ast.js");
}
