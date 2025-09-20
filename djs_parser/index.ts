import type { QualifiedName, SourceFile } from "djs_ast"
import { Parser } from "./parser.ts"

export function parse_source_file(
  qualified_name: QualifiedName,
  path: string,
  text: string,
): SourceFile {
  const parser = Parser(qualified_name, path, text)
  return parser.parse_source_file()
}
