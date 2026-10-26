import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const executable = fileURLToPath(new URL("../djs_node.ts", import.meta.url))

function cli(args, cwd) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
  })
}

async function fixture(t, files) {
  const directory = await mkdtemp(join(tmpdir(), "djs-cli-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all(
    Object.entries(files).map(([name, source]) =>
      writeFile(join(directory, name), source),
    ),
  )
  return directory
}

test("CLI help describes compile-only bytecode output", () => {
  for (const flag of ["--help", "-h"]) {
    const result = cli([flag])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /--dump-ir <module.js>\.\.\./)
    assert.match(result.stdout, /without executing/)
    assert.equal(result.stderr, "")
  }
})

test("CLI rejects missing modules, unknown flags and multiple execution entries", () => {
  for (const args of [
    [],
    ["--dump-ir"],
    ["--unknown", "entry.js"],
    ["a.js", "b.js"],
  ]) {
    const result = cli(args)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Usage: djs_node/)
  }
})
