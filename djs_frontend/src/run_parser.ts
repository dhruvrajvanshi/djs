import { show_diagnostics } from "./diagnostic.js"
import { pretty_print } from "./pretty_print.js"

export { TokenKind } from "./TokenKind.js"
export type { Token } from "./Token.js"
export {
  Expr,
  Pattern,
  type SourceFile,
  type BinOp,
  type AssignOp,
} from "./ast.gen.js"

if (process.argv[1] === import.meta.filename) {
  await main(process.argv[2])
}

async function main(path: string) {
  const fs = await import("node:fs/promises")
  const { Parser } = await import("./parser.js")
  const source_text = await fs.readFile(path, "utf-8")
  const parser = Parser(source_text)
  const source_file = parser.parse_source_file()

  show_diagnostics(path, source_text, source_file.errors)

  console.log(
    pretty_print(source_file)
      .split("\n")
      .map((line, idx) => `${idx + 1}: ${line}`)
      .join("\n"),
  )

  console.log(`Found ${source_file.errors.length} error(s)`)
}
