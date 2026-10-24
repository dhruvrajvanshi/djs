import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const tests_dir = fileURLToPath(new URL("../tests/", import.meta.url))
const executable = fileURLToPath(new URL("../djs_node.ts", import.meta.url))
const test_files = (await readdir(tests_dir))
  .filter((name) => name.endsWith(".js"))
  .sort()

assert(test_files.length > 0, `No JavaScript tests found in ${tests_dir}`)

for (const test_file of test_files) {
  test(`e2e: ${test_file}`, async () => {
    const expected = await readFile(
      path.join(tests_dir, `${path.basename(test_file, ".js")}.stdout`),
    )
    const result = spawnSync(
      process.execPath,
      [executable, path.join(tests_dir, test_file)],
      {
        cwd: tests_dir,
        encoding: "buffer",
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr?.toString("utf8"))
    assert.equal(result.stderr.toString("utf8"), "")
    assert.deepEqual(result.stdout, expected)
  })
}
