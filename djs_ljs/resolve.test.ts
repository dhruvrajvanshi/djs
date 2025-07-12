import { test } from "vitest"
import { FS } from "./FS.ts"
import { collect_source_files } from "./collect_source_files.ts"
import assert from "node:assert"
import { resolve } from "./resolve.ts"
import { VarDeclStmt } from "djs_ast"
import { rx } from "djs_std"
import { find_expr, find_stmt } from "./ast_query.ts"
import { type ValueDecl } from "./SymbolTable.ts"
import { flatten_var_decl } from "./flatten_var_decl.ts"

test("resolve smoke test", async () => {
  const fs = FS.fake({
    "foo.ljs": `
        export type SomeType = string
        export const some_import: SomeType = "hello"
    `,
    "main.ljs": `
        import { SomeType, some_import } from "./foo.ljs"
        type Foo = /* SomeType1 */ SomeType
        type Bar = /* Foo1 */ Foo
        const x: /* Bar1 */ Bar = /* some_import_1 */ some_import

        function foo(a: /* SomeType2 */ SomeType): /* SomeType3 */ SomeType {
          return /* a1 */ a
        }

        function main(): void {
          let y = foo(/* x1 */ x)
          if (/* y1 */ y) {
            return /* x2 */ x
          }
        }
    `,
  })
  const { source_files, ...source_files_result } = await collect_source_files(
    "main.ljs",
    fs,
  )
  assert.equal(await source_files_result.diagnostics.prettify(fs), "")

  const main = source_files.get("main.ljs")
  assert(main, "main.ljs file not found in source_files")
  const resolve_result = resolve(fs, main)
  assert.equal(await resolve_result.diagnostics.prettify(fs), "")

  const expected_values: Record<string, (decl: ValueDecl) => void> = {
    some_import_1: (decl) => {
      assert(decl.kind === "Import")
      assert.equal(
        decl.stmt,
        find_stmt(main, "Import", (s) => s.module_specifier === `"./foo.ljs"`),
      )
    },
    a1: (decl) => {
      assert(decl.kind === "Func")
      assert.equal(
        decl.func,
        find_stmt(main, "Func", (s) => s.func.name?.text === "foo").func,
      )
    },
    x1: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl,
        find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "x")),
      )
    },
    y1: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl,
        find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "y")),
      )
    },
    x2: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl,
        find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "x")),
      )
    },
  }
  for (const [name, assertions] of Object.entries(expected_values)) {
    const expr = find_expr(main, "Var", (e) => has_marker(e, name))
    const decl = resolve_result.values.get(expr.ident)
    assert(decl, `Value declaration for "${name}" not found`)
    assertions(decl)
  }
})

function var_decl_binds(stmt: VarDeclStmt, name: string): boolean {
  for (const s of flatten_var_decl(stmt)) {
    if (s.name === name) {
      return true
    }
  }
  return false
}

const MARKER_REGEX = rx(
  /\s*/,
  "/*",
  /\s*/,
  rx.named("marker", /[a-zA-Z0-9_]+/),
  /\s*/,
  "*/",
)
function has_marker<T extends { leading_trivia: string }>(
  item: T,
  marker: string,
) {
  return item.leading_trivia.match(MARKER_REGEX)?.groups?.marker === marker
}
