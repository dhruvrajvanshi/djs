import { parse_source_file } from "djs_parser"
import assert from "node:assert"
import { test } from "vitest"
import { build_function_symbol_table } from "./build_symbol_table.ts"
import { QualifiedName } from "djs_ast"

test("build_symbol_table", async () => {
  const source_file = parse_source_file(
    QualifiedName(),
    "test.ljs",
    `
      function foo(p1: i32, p2: string): void {
        let x = 10;
        const y = ""
        let z = () => {}

      }
  `,
  )
  assert(source_file.stmts.length === 1)
  const fn = source_file.stmts[0]
  assert(fn.kind === "Func")
  const symbol_table = build_function_symbol_table(source_file, fn.func)

  assert(symbol_table.get_value("x"))
  assert(symbol_table.get_value("y"))
  assert(symbol_table.get_value("z"))
  assert(symbol_table.get_value("p1"))
  assert(symbol_table.get_value("p2"))
})
