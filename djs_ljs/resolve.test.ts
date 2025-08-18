import { expect, test } from "vitest"
import { FS } from "./FS.ts"
import { collect_source_files } from "./collect_source_files.ts"
import assert from "node:assert/strict"
import { resolve_source_file } from "./resolve.ts"
import { VarDeclStmt } from "djs_ast"
import { rx } from "djs_std"
import { find_expr, find_stmt, find_type } from "./ast_query.ts"
import { type TypeDecl, type ValueDecl } from "./SymbolTable.ts"
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

        function foo(a: /* SomeType2 */ SomeType): /* Bar2 */ Bar {
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
  const resolve_result = resolve_source_file(fs, main)
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
      assert(decl.kind === "Param")
      assert.equal(
        decl.func,
        find_stmt(main, "Func", (s) => s.func.name?.text === "foo").func,
      )
      assert.equal(decl.param_index, 0)
    },
    x1: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl.stmt,
        find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "x")),
      )
    },
    y1: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl.stmt,
        find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "y")),
      )
    },
    x2: (decl) => {
      assert(decl.kind === "VarDecl")
      assert.equal(
        decl.stmt,
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

  const expected_types: Record<string, (decl: TypeDecl) => void> = {
    SomeType1: (decl) => {
      assert(decl.kind === "Import")
      assert.equal(
        decl.stmt,
        find_stmt(main, "Import", (s) => s.module_specifier === `"./foo.ljs"`),
      )
    },
    Foo1: (decl) => {
      assert(decl.kind === "TypeAlias")
      assert.equal(
        decl.stmt,
        find_stmt(main, "TypeAlias", (s) => s.name.text === "Foo"),
      )
    },
    SomeType2: (decl) => {
      assert(decl.kind === "Import")
      assert.equal(
        decl.stmt,
        find_stmt(main, "Import", (s) => s.module_specifier === `"./foo.ljs"`),
      )
    },
    Bar1: (decl) => {
      assert(decl.kind === "TypeAlias")
      assert.equal(
        decl.stmt,
        find_stmt(main, "TypeAlias", (s) => s.name.text === "Bar"),
      )
    },
    Bar2: (decl) => {
      assert(decl.kind === "TypeAlias")
      assert.equal(
        decl.stmt,
        find_stmt(main, "TypeAlias", (s) => s.name.text === "Bar"),
      )
    },
  }
  for (const [name, assertions] of Object.entries(expected_types)) {
    const type_annotation = find_type(main, "Ident", (e) => has_marker(e, name))
    const decl = resolve_result.types.get(type_annotation.ident)
    assert(decl, `Type declaration for "${name}" not found`)
    assertions(decl)
  }
})

test("resolve import * as foo from 'bar'", async () => {
  const fs = FS.fake({
    "bar.ljs": `
        export type Bar = u32
        export const foo: Bar = 42
    `,
    "main.ljs": `
        import * as b from "./bar.ljs"
        export const x: b.Bar = b.bar
    `,
  })
  const { source_files, ...source_files_result } = await collect_source_files(
    "main.ljs",
    fs,
  )
  assert.equal(await source_files_result.diagnostics.prettify(fs), "")
  const main = source_files.get("main.ljs")
  assert(main, "main.ljs file not found in source_files")
  const resolve_result = resolve_source_file(fs, main)
  assert.equal(await resolve_result.diagnostics.prettify(fs), "")

  const const_x_stmt = find_stmt(main, "VarDecl", (s) => var_decl_binds(s, "x"))
  assert(const_x_stmt.decl.declarators.length === 1)
  const const_x_decl = const_x_stmt.decl.declarators[0]
  const const_x_type = const_x_decl.type_annotation
  assert(const_x_type?.kind === "Qualified")

  const b_type_decl = resolve_result.types.get(const_x_type.head)
  assert(b_type_decl?.kind === "ImportStarAs")
  assert.equal(
    b_type_decl.stmt,
    find_stmt(main, "ImportStarAs", (s) => s.as_name.text === "b"),
  )

  const const_x_value = const_x_decl.init
  assert(const_x_value?.kind === "Prop")
  assert(const_x_value.lhs.kind === "Var")
  const b_value_decl = resolve_result.values.get(const_x_value.lhs.ident)

  assert(b_value_decl?.kind === "ImportStarAs")
  assert.equal(
    b_value_decl.stmt,
    find_stmt(main, "ImportStarAs", (s) => s.as_name.text === "b"),
  )
})

test("reports unbound variables", async () => {
  const fs = FS.fake({
    "main.ljs": `
        let x = y
        function foo() {
          return a(b)
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
  const resolve_result = resolve_source_file(fs, main)
  const diagnostics = resolve_result.diagnostics
  expect(await diagnostics.prettify(fs, /* colors */ false))
    .toMatchInlineSnapshot(`
      "ERROR: /main.ljs:4: Unbound variable "b"
      4|            return a(b)
                             ^~~
      5|          }
      6|      

      ERROR: /main.ljs:4: Unbound variable "a"
      4|            return a(b)
                           ^~~
      5|          }
      6|      

      ERROR: /main.ljs:2: Unbound variable "y"
      2|          let x = y
                          ^~~
      3|          function foo() {
      4|            return a(b)"
    `)
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
