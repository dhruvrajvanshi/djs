import fs from "node:fs/promises"
import { Parser } from "./src/parser"
import assert from "node:assert"

const test262Paths: string[] = []

for await (const path of fs.glob("../test262/test/**/*.js")) {
  if (path.includes("staging")) {
    continue
  }

  // Skip known problematic files that cause stack overflow
  if (path.includes("test/language/statements/function/S13.2.1_A1_T1.js")) {
    continue
  }
  test262Paths.push(path)
}

const successes: string[] = []
const failures: string[] = []
for (const path of test262Paths) {
  const source = await fs.readFile(path, "utf-8")
  console.log(`Parsing ${path}...`)
  const errors = Parser(source).parse_source_file().errors
  if (syntax_error_expected(source)) {
    if (errors.length === 0) {
      failures.push(path)
    } else {
      successes.push(path)
    }
  } else {
    if (errors.length > 0) {
      failures.push(path)
    } else {
      successes.push(path)
    }
  }
}

const expected_parse_failures = (
  await fs.readFile("../djs_parser/test_262_baseline.failed.txt", "utf-8")
).split("\n")
const expected_parse_successes = (
  await fs.readFile("../djs_parser/test_262_baseline.success.txt", "utf-8")
).split("\n")
console.log(`Successes: ${successes.length}`)
console.log(`Failures: ${successes.length}`)

if (process.env.UPDATE_BASELINE) {
  console.log("Updating baseline files...")
  await fs.writeFile(
    "../djs_parser/test_262_baseline.success.txt",
    successes.join("\n"),
  )
  await fs.writeFile(
    "../djs_parser/test_262_baseline.failed.txt",
    failures.join("\n"),
  )
} else {
  assert.equal(successes.length, expected_parse_successes.length)
  assert.equal(failures.length, expected_parse_failures.length)
}

function syntax_error_expected(source: string): boolean {
  const frontmatter = extract_frontmatter(source)
  const isNegative = frontmatter.includes("negative:")
  const syntaxErrorExpected =
    frontmatter.includes("phase: parse") &&
    frontmatter.includes("type: SyntaxError")
  return isNegative && syntaxErrorExpected
}

function extract_frontmatter(source: string): string {
  const frontmatterStart = source.indexOf("/*---")
  if (frontmatterStart === -1) return ""

  const frontmatterEnd = source.indexOf("---*/")
  if (frontmatterEnd === -1) return ""

  return source.substring(frontmatterStart, frontmatterEnd)
}
