from ast import ast_items

ast_names = set(item[2] for item in ast_items if item[0] == "ast")


def gen_type(type):
    match type:
        case [generic_name, *args]:
            return f"{generic_name}<{", ".join([gen_type(arg) for arg in args])}>"
        case "Ident":
            return f"Ident<'src>"
        case str(type) if type in ast_names:
            return f"{type}<'src>"
        case str(type):
            return type
        case _:
            raise ValueError(f"Unknown type: {type}")


if __name__ == "__main__":
    print("// This file is generated automatically")
    print("// python3 djs_ast/gen_ast.py > djs_ast/src/ast.rs")
    print("// DO NOT EDIT")
    print("use djs_syntax::Span;\n")
    print("pub type Ident<'src> = &'src str;")
    for item in ast_items:
        match item:
            case ["ast", "struct", name, *fields]:
                print("\n#[derive(Debug)]")
                print(f"pub struct {name}<'src> {{")
                print(f"    pub span: Span,")
                for [field_name, field_ty] in fields:
                    print(f"    pub {field_name}: {gen_type(field_ty)},")
                print(f"}}")
                print(f"impl {name}<'_> {{")
                print(f"    pub fn span(&self) -> Span {{")
                print(f"        self.span")
                print(f"    }}")
                print(f"}}")
            case ["ast", "enum", name, *variants]:
                print("\n#[derive(Debug)]")
                print(f"pub enum {name}<'src> {{")
                for variant in variants:
                    match variant:
                        case [variant_name, *fields]:
                            print(
                                f"    {variant_name}(Span, {', '.join([gen_type(field) for field in fields])}),"
                            )
                        case _:
                            raise ValueError(f"Unknown variant: {variant}")
                print(f"}}")
                print(f"impl {name}<'_> {{")
                print(f"    pub fn span(&self) -> Span {{")
                print(f"        match self {{")
                for [variant_name, *fields] in variants:
                    print(f"            {name}::{variant_name}(span, ..) => *span,")
                print(f"        }}")
                print(f"    }}")
                print(f"}}")
            case ["enum", name, *variants]:
                print("\n#[derive(Debug)]")
                print(f"pub enum {name} {{")
                for variant in variants:
                    print(f"    {variant},")
                print(f"}}")
            case _:
                pass
