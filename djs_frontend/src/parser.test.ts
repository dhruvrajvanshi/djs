import { test, expect } from "vitest"
import { Parser } from "./parser"
import { AssignOp, Expr } from "./ast.gen"
import { pretty_print } from "./pretty_print"
import assert from "assert"

test("test_parse_var_expr", () => {
  const expr = parse_expr("x")
  expect(expr).toMatchObject({
    kind: "Var",
  })
})

test("parse error for missing parenthesis in if condition", () => {
  const parser = Parser(
    "test.js",
    `
      if x
        y
      else z`,
  )
  const source_file = parser.parse_source_file()
  const errors = source_file.errors
  expect(errors.map((e) => `${e.span.start}: ${e.message}`).join("\n"))
    .toMatchInlineSnapshot(`
    "10: Expected '(' after 'if'"
  `)
  expect(pretty_print(source_file)).toMatchInlineSnapshot(`"if (x) y; else z;"`)
})

test("simple regex", () => {
  const pareser = Parser("test.js", `/x/`)
  const source_file = pareser.parse_source_file()
  expect(source_file.errors).toEqual([])
})
test("division and regex mixed", () => {
  const parser = Parser("test.js", "1 / 2 / /a/")
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
})
test("assignment bitwise or equal |=", () => {
  const expr = parse_expr("x |= 1")
  assert("Assign" === expr.kind)
  assert.equal(expr.operator, AssignOp.BitOrEq)
})
test("struct type decl", () => {
  const source = `type ParserState = {
    previous_lexer: Lexer
    lexer: Lexer
    last_token: Token | null
    current_token: Token
    errors: ParseError[]
  }`
  const parser = Parser("test.ts", source)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
})
test("function with if stmt", () => {
  const source = `
  function parse_optional_binding_ident(): Ident | null | Err {
    if (true) {} else {}
  }
  `
  const parser = Parser("test.ts", source)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
})

test("break statement with an identifier on the next line", () => {
  // A break followed by an identifier should only be treated as a labeled break
  // if the label is on the same line as the break
  const source = `
    break
    advance()
  `
  const source_file = Parser("test.ts", source).parse_source_file()
  expect(source_file.errors).toEqual([])
})

function parse_expr(input: string): Expr {
  const parser = Parser("test.js", input)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
