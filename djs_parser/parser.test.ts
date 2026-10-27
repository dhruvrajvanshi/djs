import { test } from "node:test"
import { Parser } from "./parser.ts"
import {
  AssignOp,
  Expr,
  prettify_diagnostics,
  QualifiedName,
  expr_to_sexpr,
  source_file_to_sexpr,
  stmt_to_sexpr,
  Stmt,
  TypeAnnotation,
  type SourceFile,
} from "djs_ast"
import assert from "assert"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

test("test_parse_var_expr", () => {
  const expr = parse_expr("x")
  assert.partialDeepStrictEqual(expr_to_sexpr(expr), {
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
  assert.strictEqual(
    errors.map((e) => `${e.span.start}: ${e.message}`).join("\n"),
    "10: Expected '(' after 'if'",
  )

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
  assert.deepStrictEqual(source_file.errors, [])
})
test("division and regex mixed", () => {
  const source_file = parse_source_file("1 / 2 / /a/")
  assert.deepStrictEqual(source_file.errors, [])
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
  assert.deepStrictEqual(source_file.errors, [])
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
  assert.deepStrictEqual(source_file.errors, [])
})

test("conditional operator", () => {
  const source = `
    a ? b : c
  `
  const source_file = parse_source_file(source)
  assert.deepStrictEqual(source_file.errors, [])
  assert(source_file.stmts[0].kind === "Expr")
  assert.deepStrictEqual(source_file.stmts[0].expr.kind, "Ternary")
})

test("default export expressions are preserved in the AST", () => {
  const source_file = parse_source_file(
    "export default { log: function(value) { return value; } };",
    "console.js",
  )
  assert.deepStrictEqual(source_file.errors, [])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "ExportDefault")
  assert.strictEqual(stmt.value.kind, "Object")
  assert.partialDeepStrictEqual(source_file_to_sexpr(source_file), {
    stmts: [{ kind: "ExportDefault", value: { kind: "Object" } }],
  })
})
test("side-effect-only imports preserve the dependency specifier", () => {
  const source_file = parse_source_file("import './dependency.js';", "entry.js")
  assert.deepStrictEqual(source_file.errors, [])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Import")
  assert.strictEqual(stmt.module_specifier, "'./dependency.js'")
  assert.strictEqual(stmt.default_import, null)
  assert.deepStrictEqual(stmt.named_imports, [])
})
test("new.target supports member access and arrow bodies", () => {
  assert.partialDeepStrictEqual(
    expr_to_sexpr(parse_expr("new.target.prototype")),
    {
      kind: "Prop",
      lhs: { kind: "NewTarget" },
      property: { text: "prototype" },
    },
  )
  assert.partialDeepStrictEqual(expr_to_sexpr(parse_expr("() => new.target")), {
    kind: "ArrowFn",
    body: { kind: "Expr", expr: { kind: "NewTarget" } },
  })
  assert.ok(parse_source_file("new.other", "entry.js").errors.length > 0)
})
test("import.meta", () => {
  assert.partialDeepStrictEqual(expr_to_sexpr(parse_expr("import.meta.url")), {
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
  assert.deepStrictEqual(source_file.errors, [])
  const [decl, variable] = source_file.stmts
  assert(decl.kind === "Func")
  assert.strictEqual(decl.func.is_async, true)
  assert(variable.kind === "VarDecl")
  const expr = variable.decl.declarators[0].init
  assert(expr?.kind === "Func")
  assert.strictEqual(expr.func.is_async, true)
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
  test("test262 baseline", { timeout: 5 * 60 * 1000 }, async (t) => {
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

    const serializers = [(value: string) => value]
    t.assert.fileSnapshot(
      successes.sort().join("\n"),
      fileURLToPath(
        new URL("./test_262_baseline.success.txt", import.meta.url),
      ),
      { serializers },
    )
    t.assert.fileSnapshot(
      failed.sort().join("\n"),
      fileURLToPath(new URL("./test_262_baseline.failed.txt", import.meta.url)),
      { serializers },
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
  assert.deepStrictEqual(source_file.errors, [])
  const stmt = source_file.stmts[0]
  assert(stmt.kind === "Expr")
  return stmt.expr
}
function parse_type(input: string): TypeAnnotation {
  const source_file = parse_source_file(`type Foo = ${input}`, "test.ts")
  assert.deepStrictEqual(source_file.errors, [])
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
  assert.deepStrictEqual(parsed.errors, [])
  const stmt = parsed.stmts[0]
  assert(stmt.kind === "ClassDecl")
  const members = stmt.class_def.body.members
  assert(members[0].kind === "FieldDef")
  assert.strictEqual(members[0].field.name.kind, "Private")
  assert.strictEqual(members[0].field.is_static, false)
  assert.strictEqual(members[0].field.initializer?.kind, "Number")
  assert(members[1].kind === "MethodDef")
  assert.strictEqual(members[1].method.is_static, true)
  assert.strictEqual(members[1].method.name.kind, "Private")
  assert(members[2].kind === "FieldDef")
  assert.strictEqual(members[2].field.is_static, true)
  assert(members[5].kind === "MethodDef")
  const returned = members[5].method.body.body.stmts[0]
  assert(returned.kind === "Return" && returned.value?.kind === "BinOp")
  assert.strictEqual(returned.value.lhs.kind, "PrivateName")
})

test("keyword property names retain their spelling", () => {
  const expr = parse_expr("promise.catch")
  assert(expr.kind === "Prop")
  assert.strictEqual(expr.property.text, "catch")
})

test("logical and binds more tightly than logical or", () => {
  const expr = parse_expr("a || b && c")
  assert(expr.kind === "BinOp")
  assert.strictEqual(expr.operator, "Or")
  assert(expr.rhs.kind === "BinOp")
  assert.strictEqual(expr.rhs.operator, "And")
})

test("private names cannot be ordinary object keys", () => {
  assert.ok(
    parse_source_file("const object = { #value: 1 };").errors.length > 0,
  )
})

test("export async function", () => {
  const source_file = parse_source_file("export async function f() {}")
  assert.deepStrictEqual(source_file.errors, [])
  assert.partialDeepStrictEqual(stmt_to_sexpr(source_file.stmts[0]), {
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
  assert.deepStrictEqual(source.errors, [])
  const declaration = source.stmts[0]
  assert(declaration.kind === "ClassDecl")
  assert.strictEqual(declaration.class_def.decorators.length, 1)
  const [call, define] = declaration.class_def.body.members
  assert(call.kind === "MethodDef" && define.kind === "MethodDef")
  assert.strictEqual(call.method.decorators.length, 1)
  assert.strictEqual(call.method.is_static, true)
  assert.strictEqual(define.method.is_static, false)
  const exported = parse_source_file(
    "export @builtin({}) class Box {}",
    "entry.js",
  )
  assert.deepStrictEqual(exported.errors, [])
  assert.partialDeepStrictEqual(
    expr_to_sexpr(parse_expr("(@builtin({name:'Box'}) class {})")),
    {
      kind: "Paren",
      expr: { kind: "Class" },
    },
  )
})
