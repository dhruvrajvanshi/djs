import { test } from "vitest"
import { FS } from "./FS.ts"

test("typechecking smoke test", () => {
  const fs = FS.fake({
    "test.js": `
       const foo = "bar";
       const baz = 20
       function main() {}
    `,
  })
})
