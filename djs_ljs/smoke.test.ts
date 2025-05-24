import { test } from "vitest"
import { parse_source_file } from "djs_parser"
import assert from "node:assert/strict"

test("smoke test", () => {
  const source_file = parse_source_file(
    "test/test.js",
    `
       extern function puts(s: *const u8): void

       export function main(): void {
          puts(c"Hello, world!")
       }
    `,
  )
  assert.deepEqual(source_file.errors, [])
})
