import { test } from "vitest"
import { parse_source_file } from "djs_parser"
import assert from "node:assert/strict"
import { prettify_diagnostics, QualifiedName } from "djs_ast"

test("smoke test", async () => {
  const source = `
     console.log("Hello, world!")
  `
  const source_file = parse_source_file(
    QualifiedName(),
    "test/test.djs",
    source,
  )
  assert.equal(
    await prettify_diagnostics("test/test.djs", source_file.errors, source),
    "",
  )
})
