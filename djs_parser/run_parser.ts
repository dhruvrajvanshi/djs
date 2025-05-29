import { show_diagnostics } from "./diagnostic.ts"
import fs from "node:fs/promises"
import { Parser } from "./parser.ts"
import { parseArgs } from "node:util"
import type { SourceFile } from "djs_ast"

export {
  type Token,
  type TokenKind,
  type Expr,
  type Pattern,
  type SourceFile,
  type BinOp,
  type AssignOp,
} from "djs_ast"

const { values: args, positionals: paths } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "internal-throw-on-error": { type: "boolean", default: false },
    "dump-ast": { type: "boolean", default: false },
    raw: { type: "string" },
  },
})

const ANSI_BLUE = "\x1b[34m"
const ANSI_RESET = "\x1b[0m"
const ANSI_BOLD = "\x1b[1m"
await main()

async function main() {
  let total_errors = 0
  if (args.raw) {
    const parser = Parser("<raw input>", args.raw, {
      throwOnError: args["internal-throw-on-error"],
    })
    const source_file = parser.parse_source_file()
    show_diagnostics("<raw input>", args.raw, source_file.errors)
    total_errors += source_file.errors.length
    if (args["dump-ast"]) {
      console.log(`${ANSI_BLUE}${ANSI_BOLD}AST Dump:${ANSI_RESET}`)
      console.dir(source_file, { depth: Infinity })
    }
  } else {
    const source_files: SourceFile[] = []
    for (const path of paths) {
      const source_text = await fs.readFile(path, "utf-8")
      const parser = Parser(path, source_text, {
        throwOnError: args["internal-throw-on-error"],
      })
      const source_file = parser.parse_source_file()
      source_files.push(source_file)

      show_diagnostics(path, source_text, source_file.errors)
      total_errors += source_file.errors.length
    }
    if (args["dump-ast"]) {
      console.log(`${ANSI_BLUE}${ANSI_BOLD}AST Dump:${ANSI_RESET}`)
      for (const source_file of source_files) {
        console.dir(source_file, { depth: Infinity })
      }
    }
  }

  console.log(`Found ${total_errors} error(s)`)
}
