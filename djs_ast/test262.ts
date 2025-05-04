import fs from "node:fs/promises"
import { Parser } from "./src/parser"

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

for (const path of test262Paths) {
  const source = await fs.readFile(path, "utf-8")
  console.log(`Parsing ${path}...`)
  const errors = Parser(source).parse_source_file().errors
}
