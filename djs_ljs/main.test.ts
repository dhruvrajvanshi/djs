import { test } from "vitest"
import { mkdir, readdir, readFile } from "node:fs/promises"
import { main } from "./main.ts"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { exec, spawn } from "node:child_process"

const files = (await readdir("./tests")).filter((it) => it.endsWith(".ljs"))

test.each(files)("%s", async (file) => {
  const expected_stdout = await readFile(
    `./tests/${file.replace(/\.ljs$/, "")}.stdout`,
    "utf-8",
  )
  await mkdir(`./test-output`, { recursive: true })
  const output = `./test-output/${file.replace(/\.ljs$/, "")}`

  await main({
    positionals: [`./tests/${file}`],
    values: {
      output: output,
    },
  })
  assert(existsSync(output))
  exec(output, (e, stdout, stderr) => {
    if (e) throw e
    assert.equal(stdout, expected_stdout)
    assert.equal(stderr, "")
  })
})
