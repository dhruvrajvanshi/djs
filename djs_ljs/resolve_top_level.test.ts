import { test } from "vitest"
import { FS } from "./FS.ts"
import { collect_source_files } from "./collect_source_files.ts"
import { Diagnostics } from "./diagnostics.ts"
import assert from "node:assert/strict"
import { resolve_top_level } from "./resolve_top_level.ts"

test("resolve top level", async () => {
  const fs = FS.fake({
    "main.djs": `
       const a_number = 1
       function foo() {}
    `,
  })
  const collect_source_files_diagnostics = new Diagnostics()
  const source_files = await collect_source_files(
    "main.djs",
    collect_source_files_diagnostics,
    fs,
  )
  assert.equal(collect_source_files_diagnostics.length, 0)

  const resolve_result = resolve_top_level(source_files)
  const entry_file = source_files["main.djs"]

  assert(entry_file, "main.djs file not found in source_files")

  const entry_file_value_decls =
    resolve_result.source_file_value_decls.get(entry_file)

  assert(entry_file_value_decls, "No value declarations found for main.djs")
  assert.equal(entry_file_value_decls.get("a_number"), entry_file.stmts[0])

  assert.equal(entry_file_value_decls.get("foo"), entry_file.stmts[1])
})
