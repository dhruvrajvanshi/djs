import { test } from "vitest"
import { parse_source_file } from "djs_parser"
import assert from "node:assert/strict"
import { prettify_diagnostics } from "../djs_ast/Diagnostic.ts"
import { QualifiedName } from "../djs_ast/QualifiedName.ts"

test("smoke test", async () => {
  const source = `
     const c = @builtin("c_str")
     extern function puts(s: *u8): void

     export function main(): void {
        puts(c\`Hello, world!\`)
     }
  `
  const source_file = parse_source_file(
    QualifiedName(),
    "test/test.ljs",
    source,
  )
  assert.equal(
    await prettify_diagnostics("test/test.ljs", source_file.errors, source),
    "",
  )
})
