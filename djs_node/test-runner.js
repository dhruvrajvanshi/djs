import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const package_dir = path.dirname(fileURLToPath(import.meta.url))
const tests_dir = path.join(package_dir, "tests")
const executable = path.join(package_dir, "djs_node.js")
const test_files = (await readdir(tests_dir))
  .filter((name) => name.endsWith(".js"))
  .sort()

assert(test_files.length > 0, `No JavaScript tests found in ${tests_dir}`)

let failures = 0

for (const test_file of test_files) {
  const expected_file = path.join(
    tests_dir,
    `${path.basename(test_file, ".js")}.stdout`,
  )
  let expected
  try {
    expected = await readFile(expected_file)
  } catch {
    console.error(
      `${test_file}: missing expected output ${path.basename(expected_file)}`,
    )
    failures += 1
    continue
  }

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

  const problems = []
  if (result.error) {
    problems.push(`process error: ${result.error.message}`)
  }
  if (result.status !== 0) {
    problems.push(`exit status: ${result.status ?? "signal/timeout"}`)
  }
  if (result.stderr?.length) {
    problems.push(`stderr: ${JSON.stringify(result.stderr.toString("utf8"))}`)
  }
  if (result.stdout && !result.stdout.equals(expected)) {
    const actual_text = result.stdout.toString("utf8")
    const expected_text = expected.toString("utf8")
    let byte_index = 0
    while (
      byte_index < result.stdout.length &&
      byte_index < expected.length &&
      result.stdout[byte_index] === expected[byte_index]
    ) {
      byte_index += 1
    }
    problems.push(
      `stdout differs at byte ${byte_index}\n` +
        `  expected: ${JSON.stringify(expected_text)}\n` +
        `  actual:   ${JSON.stringify(actual_text)}`,
    )
  } else if (!result.stdout && expected.length) {
    problems.push(
      `stdout differs at byte 0\n  expected: ${JSON.stringify(expected.toString("utf8"))}\n  actual:   ""`,
    )
  }

  if (problems.length) {
    console.error(
      `FAIL ${test_file}\n${problems.map((problem) => `  ${problem}`).join("\n")}`,
    )
    failures += 1
  } else {
    console.log(`PASS ${test_file}`)
  }
}

if (failures) {
  console.error(`${failures} of ${test_files.length} golden tests failed.`)
  process.exitCode = 1
} else {
  console.log(`${test_files.length} golden tests passed.`)
}
