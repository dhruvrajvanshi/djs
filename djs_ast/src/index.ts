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

async function main(path: string) {
  const fs = await import("node:fs/promises")
  const { Parser } = await import("./parser.js")
  const parser = Parser(await fs.readFile(path, "utf-8"))
  const source_file = parser.parse_source_file()
  console.log(
    pretty_print(source_file)
      .split("\n")
      .map((line, idx) => `${idx + 1}: ${line}`)
      .join("\n"),
  )
  console.log(
    source_file.errors
      .map((e) => `${path}:${e.span.start}: ERROR: ${e.message}`)
      .join("\n"),
  )
}
if (process.argv[1] === import.meta.filename) {
  await main(process.argv[2])
}
