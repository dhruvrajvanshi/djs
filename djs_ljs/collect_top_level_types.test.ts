import { test } from "vitest"
import { collect_source_files } from "./collect_source_files.ts"
import { FS } from "./FS.ts"
import assert from "node:assert"
import { collect_top_level_types } from "./collect_top_level_types.ts"
import { MapUtils } from "djs_std"
import { Type, type_to_sexpr } from "./type.ts"

test("collect_top_level_types", async () => {
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
  const types = collect_top_level_types(source_files, fs)

  const type_map_to_sexpr = (
    type_map: Map<string, Type> | undefined,
  ): Record<string, string> =>
    type_map
      ? Object.fromEntries(
          MapUtils.map_values(type_map, type_to_sexpr).entries(),
        )
      : {}
  const actual = {
    "aliases.ljs": type_map_to_sexpr(types.get("aliases.ljs")),
    "math.ljs": type_map_to_sexpr(types.get("math.ljs")),
    "main.ljs": type_map_to_sexpr(types.get("main.ljs")),
  }
  assert.deepEqual(actual, {
    "aliases.ljs": {},
    "math.ljs": {
      add_u32: "((u32 u32) => u32)",
    },
    "main.ljs": {
      foo: "u32",
    },
  })
})
