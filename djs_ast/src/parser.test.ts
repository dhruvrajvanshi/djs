import { test } from "vitest"
import { Parser } from "./parser"
import { Expr } from "./ast.gen"
import { expect } from "vitest"

test("test_parse_var_expr", () => {
  const expr = parse_expr("x")
  expect(expr).toMatchObject({
    kind: "Var",
  })
})

test("should_parse_parenthesized_expr", () => {
  const expr = parse_expr("(x)")
  expect(expr).toMatchObject({
    kind: "Var",
    ident: {
      text: "x",
    },
  })
})

function parse_expr(input: string): Expr {
  const parser = Parser(input)
  return parser.parse_expr()
}
