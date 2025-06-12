import { test } from "vitest"
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
