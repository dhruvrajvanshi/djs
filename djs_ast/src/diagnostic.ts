import { Span } from "./Span"

const COLOR_ERROR = "\x1b[31;1m"
const COLOR_RESET = "\x1b[0m"
const COLOR_DIMMED = "\x1b[2m"
export function preview_lines(source: string, span: Span) {
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
