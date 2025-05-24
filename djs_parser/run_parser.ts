import { show_diagnostics } from "./diagnostic.ts"
import fs from "node:fs/promises"
import { Parser } from "./parser.ts"
import { parseArgs } from "node:util"

export {
  type Token,
  type TokenKind,
  type Expr,
  type Pattern,
  type SourceFile,
  type BinOp,
  type AssignOp,
} from "djs_ast"

if (process.argv[1] === import.meta.filename) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      "internal-throw-on-error": { type: "boolean", default: false },
    },
  })
  await main(positionals, {
    throwOnError: values["internal-throw-on-error"],
  })
}

interface Config {
  throwOnError: boolean
}
async function main(paths: string[], config: Config) {
  let total_errors = 0
  for (const path of paths) {
    const source_text = await fs.readFile(path, "utf-8")
    const parser = Parser(path, source_text, config)
    const source_file = parser.parse_source_file()

    show_diagnostics(path, source_text, source_file.errors)
    total_errors += source_file.errors.length
  }

  console.log(`Found ${total_errors} error(s)`)
}
