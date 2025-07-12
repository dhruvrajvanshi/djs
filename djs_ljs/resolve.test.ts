import { test } from "vitest"
import { FS } from "./FS.ts"
import { collect_source_files } from "./collect_source_files.ts"
import assert from "node:assert"
import { resolve } from "./resolve.ts"

test.todo("resolve smoke test", async () => {
  const fs = FS.fake({
    "foo.ljs": `
        export type SomeType = string
        export const some_import: SomeType = "hello"
    `,
    "main.ljs": `
        import { SomeType, some_import } from "./foo.ljs"
        type Foo = SomeType
        type Bar = Foo
        const x: Bar = some_import

        function foo(a: SomeType): SomeType {
          return a
        }

        function main(): void {
          let y = foo(x)
          if (y) {
            return x
          }
        }
    `,
  })
  const { source_files, ...source_files_result } = await collect_source_files(
    "main.ljs",
    fs,
  )
  assert.equal(await source_files_result.diagnostics.prettify(fs), "")

  const main = source_files.get("main.ljs")
  assert(main, "main.ljs file not found in source_files")
  const resolve_result = resolve(fs, main)
  assert.equal(await resolve_result.diagnostics.prettify(fs), "")

  assert.deepEqual(resolve_result, {})
})
