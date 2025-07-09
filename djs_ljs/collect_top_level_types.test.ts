import { test } from "vitest"
import { collect_source_files } from "./collect_source_files.ts"
import { FS } from "./FS.ts"
import assert from "node:assert"
import { collect_top_level_types } from "./collect_top_level_types.ts"

test.todo("collect_top_level_types", async () => {
  const fs = FS.fake({
    "aliases.ljs": `
       type IntAlias = u32
       export type Int = IntAlias
    `,
    "math.ljs": `
      import { Int } from "./aliases.ljs"
      export function add_u32(x: Int, y: Int): Int {
        return x + y
      }
    `,
    "main.ljs": `
      import { add_u32 } from "./math.ljs"
      const foo: u32 = add_u32(1, 2)
    `,
  })
  const { source_files, diagnostics } = await collect_source_files(
    "main.ljs",
    fs,
  )
  assert.equal(diagnostics.size, 0)
  const result = collect_top_level_types(source_files, fs)
  assert.deepEqual(result, {})
})
