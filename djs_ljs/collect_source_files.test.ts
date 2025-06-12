import { test, expect } from "vitest"
import { collect_source_files } from "./collect_source_files.ts"
import { Diagnostics } from "./diagnostics.ts"
import { FS } from "./FS.ts"
import assert from "node:assert"

test("collect_source_files smoke test", async () => {
  const diagnostics = new Diagnostics()
  const fs = FS.fake({
    "main.ljs": `
         import { print_hello } from "./imported.ljs"
         function main(): void {
            print_hello()
         }
      `,
    "imported.ljs": `
          import { do_nothing } from "./transitive.ljs"
          extern function puts(s: *const u8): void
          export function print_hello(): void {
            puts(c\`Hello, world!\`)
            do_nothing()
          }
      `,
    "transitive.ljs": `
       export function do_nothing(): void {}
     `,
  })
  await collect_source_files("main.ljs", diagnostics, fs)
  assert.equal(await diagnostics.prettify(fs), "")
})

test("should report errors if imported file can't be read", async () => {
  const diagnostics = new Diagnostics()
  const fs = FS.fake({
    "main.ljs": `
        import { correct_import } from "./correct_import.ljs"
        function main(): void {
            correct_import()
        }
    `,
    "correct_import.ljs": `
        import { missing_import } from "./missing_import.ljs"
        extern function puts(s: *const u8): void
        export function correct_import(): void {
            puts(c\`Hello, world!\`)
            missing_import()
        }
    `,
  })
  const source_files = await collect_source_files("main.ljs", diagnostics, fs)
  assert.equal(Object.values(source_files).length, 2)

  const correct_import_diagnostics = diagnostics.get("correct_import.ljs")
  expect(correct_import_diagnostics).toHaveLength(1)
  expect(correct_import_diagnostics[0].message).toBe(
    'Failed to import module "./missing_import.ljs"',
  )
})
