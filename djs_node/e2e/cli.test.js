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

test("--dump-ir prints all supplied modules without linking or executing them", async (t) => {
  const directory = await fixture(t, {
    "first.js": `
      import "./missing.js";
      export function answer() { return 42; }
      throw "must not execute";
    `,
    "second.js": "export const second = true;",
  })
  const result = cli(["--dump-ir", "first.js", "second.js"], directory)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  assert.equal((result.stdout.match(/^Module /gm) ?? []).length, 2)
  assert.ok(result.stdout.startsWith('Module "first.js"\n'))
  assert.match(result.stdout, /function answer\(\) #1/)
  assert.match(result.stdout, /THROW %\d+/)
  assert.match(result.stdout, /\nModule "second.js"\n/)
})

test("--dump-ir accepts options after paths and -- for dash-prefixed paths", async (t) => {
  const directory = await fixture(t, { "-entry.js": "export default 1;" })
  const result = cli(["--dump-ir", "--", "-entry.js"], directory)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Module "-entry.js"/)
  const trailing = cli(["./-entry.js", "--dump-ir"], directory)
  assert.equal(trailing.status, 0, trailing.stderr)
  assert.match(trailing.stdout, /^Module "\.\/-entry.js"/)
})

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

test("--dump-ir reports file and compilation failures", async (t) => {
  const directory = await fixture(t, { "invalid.js": "const value = ;" })
  for (const [path, diagnostic] of [
    ["missing.js", /ENOENT/],
    ["invalid.js", /SyntaxError:.*invalid.js/],
  ]) {
    const result = cli(["--dump-ir", path], directory)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, diagnostic)
  }
})
