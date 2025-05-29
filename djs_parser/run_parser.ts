import fs from "node:fs/promises"
import { Parser } from "./parser.ts"
import { parseArgs, inspect } from "node:util"
import type { SourceFile } from "djs_ast"
import { source_file_to_sexpr, show_diagnostics } from "djs_ast"

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
    "no-errors": { type: "boolean", default: false },
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
    if (!args["no-errors"]) {
      show_diagnostics("<raw input>", source_file.errors, args.raw)
    }
    total_errors += source_file.errors.length
    if (args["dump-ast"]) {
      console.log(`${ANSI_BLUE}${ANSI_BOLD}AST Dump:${ANSI_RESET}`)
      dump_source_file(source_file)
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

      if (!args["no-errors"]) {
        show_diagnostics(path, source_file.errors, null)
      }
      total_errors += source_file.errors.length
    }
    if (args["dump-ast"]) {
      console.log(`${ANSI_BLUE}${ANSI_BOLD}AST Dump:${ANSI_RESET}`)
      for (const source_file of source_files) {
        dump_source_file(source_file)
      }
    }
  }

  console.log(`Found ${total_errors} error(s)`)
}
function dump_source_file(source_file: SourceFile) {
  console.log(
    inspect(source_file_to_sexpr(source_file), {
      depth: Infinity,
      colors: true,
    }),
  )
}
