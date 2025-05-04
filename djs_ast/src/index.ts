import { pretty_print } from "./pretty_print.js"
import { Span } from "./Span.js"

export { TokenKind } from "./TokenKind.js"
export type { Token } from "./Token.js"
export {
  Expr,
  Pattern,
  type SourceFile,
  type BinOp,
  type AssignOp,
} from "./ast.gen.js"
const COLOR_ERROR = "\x1b[31;1m"
const COLOR_RESET = "\x1b[0m"
const COLOR_DIMMED = "\x1b[2m"
async function main(path: string) {
  const fs = await import("node:fs/promises")
  const { Parser } = await import("./parser.js")
  const source_text = await fs.readFile(path, "utf-8")
  const parser = Parser(source_text)
  const source_file = parser.parse_source_file()

  console.log(
    source_file.errors
      .map(
        (e) =>
          `${COLOR_ERROR}ERROR:${COLOR_RESET} ${path}:${offset_to_line(source_text, e.span.start)}: ${e.message}\n${preview_lines(source_text, e.span)}`,
      )
      .join("\n\n"),
  )

  console.log(
    pretty_print(source_file)
      .split("\n")
      .map((line, idx) => `${idx + 1}: ${line}`)
      .join("\n"),
  )

  console.log(`Found ${source_file.errors.length} error(s)`)
}
function preview_lines(source: string, span: Span) {
  const [start_line, col] = offset_to_line_and_col(source, span.start)
  const lines = source.split("\n").slice(start_line - 1, start_line + 2)
  return lines
    .map((line, idx) => {
      const line_number = start_line + idx
      const prefix = `${line_number}|  `
      const first = `${COLOR_DIMMED}${prefix}${COLOR_RESET}${line}`
      if (idx === 0) {
        return (
          first +
          "\n" +
          " ".repeat(prefix.length + col - 1) +
          `${COLOR_ERROR}^~~${COLOR_RESET}`
        )
      } else return first
    })
    .join("\n")
}
function offset_to_line(source: string, offset: number): number {
  return offset_to_line_and_col(source, offset)[0]
}
function offset_to_line_and_col(
  source: string,
  offset: number,
): [number, number] {
  const lines = source.split("\n")
  let line_number = 1
  let col_number = offset + 1
  for (const line of lines) {
    if (offset < line.length) {
      return [line_number, col_number]
    }
    offset -= line.length + 1
    line_number++
    col_number = offset + 1
  }
  return [line_number, col_number]
}
if (process.argv[1] === import.meta.filename) {
  await main(process.argv[2])
}
