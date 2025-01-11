from src.js_ast import ast_items

root_items = [item for item in ast_items if item[0] == "ast"]
ast_item_names = set(item[2] for item in ast_items if item[0] == "ast")

def to_snake_case(name: str) -> str:
    return "".join(["_" + c.lower() if c.isupper() else c for c in name]).lstrip("_")

def gen_field_visitor(name: str, field_ty: str):
    match field_ty:
        case str(n) if n in ast_item_names:
            p(f"            visitor.visit_{to_snake_case(n)}({name});")
        case ["Vec", field_ty]:
            p(f"            for item in {name} {{")
            if field_ty in ast_item_names:
                p(f"                visitor.visit_{to_snake_case(field_ty)}(item);")
            else:
                p(f"                visitor.visit_{to_snake_case(field_ty)}(item);")
            p(f"            }}")
        case ["Option", ["Box", field_ty]]:
            p(f"            if let Some(item) = {name} {{")
            p(f"                visitor.visit_{to_snake_case(field_ty)}(item);")
            p(f"            }}")
        case ["Option", field_ty]:
            p(f"            if let Some(item) = {name} {{")
            if field_ty in ast_item_names:
                p(f"                visitor.visit_{to_snake_case(field_ty)}(item);")
            else:
                p(f"                visitor.visit_{to_snake_case(field_ty)}(item);")
            p(f"            }}")
        case ["Box", field_ty]:
            p(f"            visitor.visit_{to_snake_case(field_ty)}({name});")

p = print
if __name__ == "__main__":
    p("// This file is generated automatically")
    p("// python3 djs_ast/gen_visitor.py > djs_ast/src/visitor.rs && cargo fmt -- djs_ast/src/visitor.rs")
    p("// DO NOT EDIT")
    p("use crate::ast::*;\n")
    p("pub trait Visitor<'a>: Sized {")
    for [_, item_ty, item_name, *_] in root_items:
        p()
        p(f"    fn visit_{to_snake_case(item_name)}(&mut self, node: &{item_name}) {{")
        p(f"        walk_{to_snake_case(item_name)}(self, node)")
        p(f"    }}")
    p(f"}}")

    for [_, item_ty, item_name, *rest] in root_items:
        p("")
        p(f"pub fn walk_{to_snake_case(item_name)}<'a, V: Visitor<'a>>(visitor: &mut V, node: &{item_name}) {{")
        match item_ty:
            case "struct":
                for [field_name, field_ty] in rest:
                    gen_field_visitor(f"&node.{field_name}", field_ty)
            case "enum":
                p(f"    match node {{")
                for [variant_name, *fields] in rest:
                    patterns = ", ".join([f"f{i}" for i in range(len(fields))])
                    p(f"        {item_name}::{variant_name}(_, {patterns}) => {{")
                    for i, field_ty in enumerate(fields):
                        gen_field_visitor(f"f{i}", field_ty)
                    p(f"        }}")
                p(f"    }}")
        p(f"}}")
