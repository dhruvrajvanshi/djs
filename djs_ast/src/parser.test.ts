import { test, expect } from "vitest"
import { Parser } from "./parser"
import { Expr } from "./ast.gen"
import { pretty_print } from "./pretty_print"
import fs from "fs/promises"
import assert from "assert"

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
  const parser = Parser(`
      if x
        y
      else z`)
  const source_file = parser.parse_source_file()
  const errors = source_file.errors
  expect(errors.map((e) => `${e.span.start}: ${e.message}`).join("\n"))
    .toMatchInlineSnapshot(`
    "10: Expected '(' after 'if'"
  `)
  expect(pretty_print(source_file)).toMatchInlineSnapshot(`"if (x) y; else z;"`)
})

function parse_expr(input: string): Expr {
  const parser = Parser(input)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
