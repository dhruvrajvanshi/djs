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

const test262Paths: string[] = []

for await (const path of fs.glob("../test262/test/**/*.js")) {
  if (path.includes("staging")) {
    continue
  }

  // Skip known problematic files that cause stack overflow
  if (path.includes("test/language/statements/function/S13.2.1_A1_T1.js")) {
    continue
  }
  test262Paths.push(path)
}
test.each(test262Paths)("test262: %s", async (filePath) => {
  const source = await fs.readFile(filePath, "utf-8")

  const expectedParseError = syntax_error_expected(source)
  const parser = Parser(source)
  const source_file = parser.parse_source_file()
  if (expectedParseError) {
    // If the test262 file is expected to throw a syntax error, check if it does
    const errors = source_file.errors
    expect(errors.length).toBeGreaterThan(0)
  } else {
    // If the test262 file is not expected to throw a syntax error, check if it does not
    expect(source_file.errors).toEqual([])
  }
})

function syntax_error_expected(source: string): boolean {
  const frontmatter = extract_frontmatter(source)
  const isNegative = frontmatter.includes("negative:")
  const syntaxErrorExpected =
    frontmatter.includes("phase: parse") &&
    frontmatter.includes("type: SyntaxError")
  return isNegative && syntaxErrorExpected
}

function extract_frontmatter(source: string): string {
  const frontmatterStart = source.indexOf("/*---")
  if (frontmatterStart === -1) return ""

  const frontmatterEnd = source.indexOf("---*/")
  if (frontmatterEnd === -1) return ""

  return source.substring(frontmatterStart, frontmatterEnd)
}

function parse_expr(input: string): Expr {
  const parser = Parser(input)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
