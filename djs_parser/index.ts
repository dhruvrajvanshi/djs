import type { SourceFile } from "djs_ast";
import { Parser } from "./parser.ts";

export function parse_source_file(
  path: string,
  text: string
): SourceFile {
  const parser = Parser(path, text);
  return parser.parse_source_file()
}
