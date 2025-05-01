import { test } from "vitest"
import { Parser } from "./parser"
import { Expr } from "./ast.gen"
import { expect } from "vitest"
import { pretty_print } from "./pretty_print"

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

test("parse error for missing parenthesis in if condition", () => {
  const parser = Parser("if x y else z")
  const source_file = parser.parse_source_file()
  const errors = source_file.errors
  expect(pretty_print(source_file)).toMatchInlineSnapshot(`"if (x) y; else z;"`)
  expect(errors.map((e) => `${e.span.start}: ${e.message}`).join("\n"))
    .toMatchInlineSnapshot(`
    "3: Expected a '('
    5: Expected a ')'
    7: Missing semicolon"
  `)
})

function parse_expr(input: string): Expr {
  const parser = Parser(input)
  return parser.parse_expr()
}
