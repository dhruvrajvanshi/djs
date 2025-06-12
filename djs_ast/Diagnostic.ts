import type { Span } from "./Span.ts"
import fs from "node:fs/promises"

export interface Diagnostic {
  span: Span
  message: string
  hint: string | null
}

const COLOR_ERROR = "\x1b[31;1m"
const COLOR_BLUE = "\x1b[34m"
const COLOR_RESET = "\x1b[0m"
const COLOR_DIMMED = "\x1b[2m"
const BOLD = "\x1b[1m"

export async function prettify_diagnostics(
  path: string,
  errors: readonly Diagnostic[],
  source_text: string | null,
) {
  if (source_text === null) {
    source_text = await fs.readFile(path, "utf8")
  }
  return [...errors]
    .sort((a, b) => b.span.start - a.span.start)
    .map(
      (e) =>
        `${COLOR_ERROR}ERROR:${COLOR_RESET} ${path}:${offset_to_line(source_text, e.span.start)}: ${e.message}\n${preview_lines(source_text, e.span)}${show_hint(e.hint)}`,
    )
    .join("\n\n")
}
export function show_diagnostics(
  path: string,
  errors: readonly Diagnostic[],
  source_text: string | null,
) {
  console.log(prettify_diagnostics(path, errors, source_text))
}
function show_hint(hint: string | null): string {
  if (hint === null) return ""
  return `\n\n${COLOR_BLUE}${BOLD}HINT: ${hint}${COLOR_RESET}`
}
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
function offset_to_line(source: string, offset: number): number {
  return offset_to_line_and_col(source, offset)[0]
}
