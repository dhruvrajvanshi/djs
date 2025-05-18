import { show_diagnostics } from "./diagnostic.js"

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
  await main(process.argv.slice(2))
}

async function main(paths: string[]) {
  const fs = await import("node:fs/promises")
  const { Parser } = await import("./parser.js")
  let total_errors = 0
  for (const path of paths) {
    const source_text = await fs.readFile(path, "utf-8")
    const parser = Parser(path, source_text)
    const source_file = parser.parse_source_file()

    show_diagnostics(path, source_text, source_file.errors)
    total_errors += source_file.errors.length
  }

  console.log(`Found ${total_errors} error(s)`)
}
