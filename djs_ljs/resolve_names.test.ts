import { test } from "vitest"
import { FS } from "./FS.ts"
import { collect_source_files } from "./collect_source_files.ts"
import { Diagnostics } from "./diagnostics.ts"
import { resolve_names } from "./resolve_names.ts"
import assert from "node:assert/strict"
import { inspect } from "node:util"

test("should show a diagnostic for unbound variable names", async () => {
  const fs = FS.fake({
    "main.ljs": `
       function main(): void {
          console.log(x)
       }
    `,
  })
  const diagnostics = new Diagnostics()
  const source_files = await collect_source_files("main.ljs", diagnostics, fs)
  const resolver_result = resolve_names(source_files, diagnostics)

  assert.equal(inspect(resolver_result, { depth: Infinity }), "")

  assert.equal(await diagnostics.prettify(fs), "<TODO>")
})
