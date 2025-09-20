import assert from "node:assert/strict"
import { parse_source_file } from "djs_parser"
import { test } from "vitest"
import {
  expr_to_sexpr,
  QualifiedName,
  type_annotation_to_sexpr,
  VarDeclStmt,
} from "djs_ast"
import { flatten_var_decl, type FlatVarDecl } from "./flatten_var_decl.ts"
import type { SExpr } from "djs_ast"

test("Simple var decls", () => {
  const source = parse_source_file(
    QualifiedName(),
    "test.ljs",
    `
        let x: Foo = 30
        let y = "hello"
        let z: boolean
        let t
    `,
  )
  assert(source.errors.length === 0)
  const stmts = source.stmts.filter((it) => it instanceof VarDeclStmt)
  assert(stmts.length === 4)
  const flattened = stmts.flatMap((it) => flatten_var_decl(it.decl))
  assert.deepEqual(flattened.map(flat_var_decl_to_sexpr), [
    [
      "let",
      "x",
      ":",
      { kind: "Ident", ident: "Foo", leading_trivia: "" },
      "=",
      { kind: "Number", text: "30" },
    ],
    ["let", "y", "=", { kind: "String", text: '"hello"' }],
    ["let", "z", ":", { kind: "Ident", ident: "boolean", leading_trivia: "" }],
    ["let", "t"],
  ])
})

function flat_var_decl_to_sexpr(self: FlatVarDecl): SExpr {
  return [
    self.decl_type.toLowerCase(),
    self.name,
    ...(self.type_annotation
      ? [":", type_annotation_to_sexpr(self.type_annotation)]
      : []),
    ...(self.init ? ["=", expr_to_sexpr(self.init)] : []),
  ]
}
