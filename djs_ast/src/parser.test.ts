import { test } from "vitest"
import { Parser } from "./parser"
import { Expr } from "./ast.gen"
import { expect } from "vitest"
// #[test]
// fn test_parse_var_expr() {
//     let source = "x";
//     let mut parser = Parser::new(source);
//     let expr = parser.parse_expr().unwrap();
//     assert!(matches!(expr, Expr::Var(Ident { text: "x", .. })));
// }

// #[test]
// fn should_parse_parenthesized_expr() {
//     let source = "(x)";
//     let mut parser = Parser::new(source);
//     let expr = parser.parse_expr().unwrap();
//     assert!(matches!(expr, Expr::Var(ident!("x"))));
// }
test("test_parse_var_expr", () => {
  const expr = parse_expr("x")
  expect(expr).toMatchObject({
    kind: "Var",
  })
})

function parse_expr(input: string): Expr {
  const parser = Parser(input)
  return parser.parse_expr()
}
