use std::{
    env,
    fs::File,
    path::Path,
    process::{Command, Stdio},
};

fn main() {
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let run_node_script_and_format = |script_name, output| {
        let rs_file = Path::new(&out_dir).join(output);
        let mut script_result = Command::new("node")
            .args([script_name])
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();

        let status = script_result.wait().unwrap();
        assert!(status.success());

        assert!(Command::new("rustfmt")
            .stdin(Stdio::from(script_result.stdout.unwrap()))
            .stdout(File::create(&rs_file).unwrap())
            .stderr(Stdio::inherit())
            .status()
            .unwrap()
            .success());
    };

    run_node_script_and_format("gen_ast.js", "ast.rs");
    run_node_script_and_format("gen_tokens.js", "tokens.rs");

    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-changed=src/ast.js");
    println!("cargo::rerun-if-changed=gen_ast.js");
    println!("cargo::rerun-if-changed=src/tokens.js");
    println!("cargo::rerun-if-changed=src/gen_tokens.js");
}
