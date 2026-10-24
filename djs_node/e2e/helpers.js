import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const executable = fileURLToPath(new URL("../djs_node.ts", import.meta.url))

export async function fixture(t, files) {
  const directory = await mkdtemp(join(tmpdir(), "djs-e2e-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all(
    Object.entries(files).map(([name, source]) =>
      writeFile(join(directory, name), source),
    ),
  )
  return {
    directory,
    run({ status = 0, stderr = "" } = {}) {
      const result = spawnSync(process.execPath, [executable, "entry.js"], {
        cwd: directory,
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024,
      })
      assert.ifError(result.error)
      assert.equal(result.status, status, result.stderr)
      if (stderr instanceof RegExp) assert.match(result.stderr, stderr)
      else assert.equal(result.stderr, stderr)
      return result
    },
  }
}

export async function execute(t, source) {
  const app = await fixture(t, { "entry.js": source })
  return { output: app.run().stdout }
}
