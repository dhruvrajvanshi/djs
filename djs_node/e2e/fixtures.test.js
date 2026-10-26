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

async function read_expected(file) {
  try {
    return await readFile(path.join(tests_dir, file))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

// Each expected file may be omitted: output then defaults to empty and the
// exit status to 0.
for (const test_file of test_files) {
  test(`e2e: ${test_file}`, async () => {
    const name = path.basename(test_file, ".js")
    const stdout = await read_expected(`${name}.stdout`)
    const stderr = await read_expected(`${name}.stderr`)
    const status = await read_expected(`${name}.status`)
    assert(stdout || stderr, `${name} has no .stdout or .stderr file`)
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
    // Diagnostics name files by absolute path, so make them machine-independent.
    const actual_stderr = result.stderr
      .toString("utf8")
      .replaceAll(tests_dir, "")
    assert.equal(result.status, status ? Number(status) : 0, actual_stderr)
    assert.equal(actual_stderr, stderr?.toString("utf8") ?? "")
    assert.deepEqual(result.stdout, stdout ?? Buffer.alloc(0))
  })
}
