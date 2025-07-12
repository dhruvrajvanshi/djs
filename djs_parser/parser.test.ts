import { test, expect } from "vitest"
import { Parser } from "./parser.ts"
import { AssignOp, Expr, source_file_to_sexpr, TypeAnnotation } from "djs_ast"
import assert from "assert"
import fs from "node:fs/promises"

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

  assert.deepEqual(source_file_to_sexpr(source_file), {
    kind: "SourceFile",
    path: "test.js",
    stmts: [
      {
        kind: "If",
        condition: {
          kind: "Var",
          ident: "x",
          leading_trivia: "",
        },
        if_false: {
          kind: "Expr",
          expr: {
            kind: "Var",
            ident: "z",
            leading_trivia: "",
          },
        },
        if_true: {
          kind: "Expr",
          expr: {
            kind: "Var",
            ident: "y",
            leading_trivia: "",
          },
        },
      },
    ],
  })
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

test("conditional operator", () => {
  const source = `
    a ? b : c
  `
  const parser = Parser("test.js", source)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  assert(source_file.stmts[0].kind === "Expr")
  expect(source_file.stmts[0].expr.kind).toEqual("Ternary")
})

test("is_exported should be correctly set", () => {
  const source = `
    export extern function foo(): void;
    export function bar(): void {}
  `
  const parser = Parser("test.ljs", source)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  assert(source_file.stmts[0].kind === "LJSExternFunction")
  expect(source_file.stmts[0].is_exported).toBe(true)

  assert(source_file.stmts[1].kind === "Func")
  expect(source_file.stmts[1].is_exported).toBe(true)
})
test("preserves leading trivia in type aliases", () => {
  const t = parse_type(`/* leading trivia comment */ Foo`)
  assert(t.kind === "Ident")
  assert.equal(t.leading_trivia, "/* leading trivia comment */")
})

if (process.env.CI) {
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
  test.each(test262Paths)("test262 coverage", async (path) => {
    const source = await fs.readFile(path, "utf-8")
    Parser(path, source).parse_source_file().errors
  })
}

function parse_expr(input: string): Expr {
  const parser = Parser("test.js", input)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
function parse_type(input: string): TypeAnnotation {
  const parser = Parser("test.js", `type Foo = ${input}`)
  const source_file = parser.parse_source_file()
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "TypeAlias")
  return stmt.type_annotation
}
