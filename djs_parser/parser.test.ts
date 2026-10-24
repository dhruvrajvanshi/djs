import { test, expect } from "vitest"
import { Parser } from "./parser.ts"
import {
  AssignOp,
  Expr,
  prettify_diagnostics,
  QualifiedName,
  source_file_to_sexpr,
  Stmt,
  TypeAnnotation,
  type SourceFile,
} from "djs_ast"
import assert from "assert"
import fs from "node:fs/promises"

test("test_parse_var_expr", () => {
  const expr = parse_expr("x")
  expect(expr).toMatchObject({
    kind: "Var",
  })
})

test("parse error for missing parenthesis in if condition", () => {
  const source_file = parse_source_file(
    `
      if x
        y
      else z`,
  )
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
          ident: {
            kind: "Ident",
            text: "x",
          },
          leading_trivia: "",
        },
        if_false: {
          kind: "Expr",
          expr: {
            kind: "Var",
            ident: {
              kind: "Ident",
              text: "z",
            },
            leading_trivia: "",
          },
        },
        if_true: {
          kind: "Expr",
          expr: {
            kind: "Var",
            ident: {
              kind: "Ident",
              text: "y",
            },
            leading_trivia: "",
          },
        },
      },
    ],
  })
})

test("simple regex", () => {
  const source_file = parse_source_file(`/x/`)
  expect(source_file.errors).toEqual([])
})
test("division and regex mixed", () => {
  const source_file = parse_source_file("1 / 2 / /a/")
  expect(source_file.errors).toEqual([])
})
test("assignment bitwise or equal |=", () => {
  const expr = parse_expr("x |= 1")
  assert("Assign" === expr.kind)
  assert.equal(expr.operator, AssignOp.BitOrEq)
})
test("function with if stmt", () => {
  const source = `
  function parse_optional_binding_ident(): Ident | null | Err {
    if (true) {} else {}
  }
  `
  const source_file = parse_source_file(source, "test.ts")
  expect(source_file.errors).toEqual([])
})

test("break statement with an identifier on the next line", () => {
  // A break followed by an identifier should only be treated as a labeled break
  // if the label is on the same line as the break
  const source = `
    while (true) {
      break
      advance()
    }
  `
  const source_file = parse_source_file(source)
  expect(source_file.errors).toEqual([])
})

test("conditional operator", () => {
  const source = `
    a ? b : c
  `
  const source_file = parse_source_file(source)
  expect(source_file.errors).toEqual([])
  assert(source_file.stmts[0].kind === "Expr")
  expect(source_file.stmts[0].expr.kind).toEqual("Ternary")
})

test("default export expressions are preserved in the AST", () => {
  const source_file = parse_source_file(
    "export default { log: function(value) { return value; } };",
    "console.js",
  )
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "ExportDefault")
  expect(stmt.value.kind).toBe("Object")
  expect(source_file_to_sexpr(source_file)).toMatchObject({
    stmts: [{ kind: "ExportDefault", value: { kind: "Object" } }],
  })
})
test("side-effect-only imports preserve the dependency specifier", () => {
  const source_file = parse_source_file("import './dependency.js';", "entry.js")
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Import")
  expect(stmt.module_specifier).toBe("'./dependency.js'")
  expect(stmt.default_import).toBeNull()
  expect(stmt.named_imports).toEqual([])
})
test("new.target supports member access and arrow bodies", () => {
  expect(parse_expr("new.target.prototype")).toMatchObject({
    kind: "Prop",
    lhs: { kind: "NewTarget" },
    property: { text: "prototype" },
  })
  expect(parse_expr("() => new.target")).toMatchObject({
    kind: "ArrowFn",
    body: { kind: "Expr", expr: { kind: "NewTarget" } },
  })
  expect(
    parse_source_file("new.other", "entry.js").errors.length,
  ).toBeGreaterThan(0)
})
test("import.meta", () => {
  expect(parse_expr("import.meta.url")).toMatchObject({
    kind: "Prop",
    lhs: { kind: "ImportMeta" },
    property: { text: "url" },
  })
})
test("async function declarations and expressions preserve their async flag", () => {
  const source_file = parse_source_file(
    "async function f() {} const g = async function() {};",
    "entry.js",
  )
  expect(source_file.errors).toEqual([])
  const [decl, variable] = source_file.stmts
  assert(decl.kind === "Func")
  expect(decl.func.is_async).toBe(true)
  assert(variable.kind === "VarDecl")
  const expr = variable.decl.declarators[0].init
  assert(expr?.kind === "Func")
  expect(expr.func.is_async).toBe(true)
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

    const text = await fs.readFile(path, "utf-8")

    // Skip known problematic files that cause stack overflow
    if (path.includes("test/language/statements/function/S13.2.1_A1_T1.js")) {
      continue
    }

    const frontmatter = extract_frontmatter(text)

    if (frontmatter.includes("IsHTMLDDA")) {
      continue
    }
    if (frontmatter.includes("noStrict")) {
      continue
    }
    test262Paths.push(path)
  }
  test("test262 baseline", { timeout: 5 * 60 * 1000 }, async () => {
    const failed: string[] = []
    const successes: string[] = []
    for (const path of test262Paths) {
      const source = await fs.readFile(path, "utf-8")
      const source_file = Parser(
        QualifiedName(),
        path,
        source,
      ).parse_source_file()
      if (source_file.errors.length !== 0 && syntax_error_expected(source)) {
        successes.push(path)
      } else if (
        source_file.errors.length === 0 &&
        !syntax_error_expected(source)
      ) {
        successes.push(path)
      } else {
        failed.push(path)
      }
    }

    await expect(successes.sort().join("\n")).toMatchFileSnapshot(
      "./test_262_baseline.success.txt",
    )
    await expect(failed.sort().join("\n")).toMatchFileSnapshot(
      "./test_262_baseline.failed.txt",
    )
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
}

function parse_expr(input: string): Expr {
  const source_file = parse_source_file(input)
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
function parse_type(input: string): TypeAnnotation {
  const source_file = parse_source_file(`type Foo = ${input}`, "test.ts")
  expect(source_file.errors).toEqual([])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "TypeAlias")
  return stmt.type_annotation
}
function parse_stmt(input: string, name = "test.js"): Stmt {
  const source_file = parse_source_file(input, name)
  assert(prettify_diagnostics("", source_file.errors, input, false), "")
  const stmt = source_file.stmts[0]
  assert.equal(source_file.stmts.length, 1)
  return stmt
}

function parse_source_file(source: string, name = "test.js"): SourceFile {
  return Parser(QualifiedName(), name, source).parse_source_file()
}

test("class members preserve static and private metadata and field initializers", () => {
  const parsed = parse_source_file(`class Box {
    #value = 1;
    static #read(box) { return box.#value; }
    static value = this;
    get value() { return this.#value; }
    set value(next) { this.#value = next; }
    static has(box) { return #value in box; }
  }`)
  expect(parsed.errors).toEqual([])
  const stmt = parsed.stmts[0]
  assert(stmt.kind === "ClassDecl")
  const members = stmt.class_def.body.members
  assert(members[0].kind === "FieldDef")
  expect(members[0].field.name.kind).toBe("Private")
  expect(members[0].field.is_static).toBe(false)
  expect(members[0].field.initializer?.kind).toBe("Number")
  assert(members[1].kind === "MethodDef")
  expect(members[1].method.is_static).toBe(true)
  expect(members[1].method.name.kind).toBe("Private")
  assert(members[2].kind === "FieldDef")
  expect(members[2].field.is_static).toBe(true)
  assert(members[5].kind === "MethodDef")
  const returned = members[5].method.body.body.stmts[0]
  assert(returned.kind === "Return" && returned.value?.kind === "BinOp")
  expect(returned.value.lhs.kind).toBe("PrivateName")
})

test("keyword property names retain their spelling", () => {
  const expr = parse_expr("promise.catch")
  assert(expr.kind === "Prop")
  expect(expr.property.text).toBe("catch")
})

test("logical and binds more tightly than logical or", () => {
  const expr = parse_expr("a || b && c")
  assert(expr.kind === "BinOp")
  expect(expr.operator).toBe("Or")
  assert(expr.rhs.kind === "BinOp")
  expect(expr.rhs.operator).toBe("And")
})

test("private names cannot be ordinary object keys", () => {
  expect(
    parse_source_file("const object = { #value: 1 };").errors.length,
  ).toBeGreaterThan(0)
})

test("export async function", () => {
  const source_file = parse_source_file("export async function f() {}")
  expect(source_file.errors).toEqual([])
  expect(source_file.stmts[0]).toMatchObject({
    kind: "Func",
    is_exported: true,
    func: { is_async: true },
  })
})

test("intrinsic decorators are retained on classes and methods", () => {
  const source = parse_source_file(
    `
    @builtin({name:"Array",prototype:"array"})
    class Array {
      @internalMethod("Call") static #call(receiver,args) {return args}
      @internalMethod("DefineOwnProperty") #define(key,descriptor) {return false}
    }
  `,
    "entry.js",
  )
  expect(source.errors).toEqual([])
  const declaration = source.stmts[0]
  assert(declaration.kind === "ClassDecl")
  expect(declaration.class_def.decorators).toHaveLength(1)
  const [call, define] = declaration.class_def.body.members
  assert(call.kind === "MethodDef" && define.kind === "MethodDef")
  expect(call.method.decorators).toHaveLength(1)
  expect(call.method.is_static).toBe(true)
  expect(define.method.is_static).toBe(false)
  const exported = parse_source_file(
    "export @builtin({}) class Box {}",
    "entry.js",
  )
  expect(exported.errors).toEqual([])
  expect(parse_expr("(@builtin({name:'Box'}) class {})")).toMatchObject({
    kind: "Paren",
    expr: { kind: "Class" },
  })
})
