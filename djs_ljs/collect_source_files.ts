import { ASTVisitorBase, type SourceFile, type Stmt } from "djs_ast"
import { parse_source_file } from "djs_parser"
import { existsSync, promises as fs } from "node:fs"
import type { Diagnostics } from "./diagnostics.ts"
import * as Queue from "./queue.ts"
import assert from "node:assert"

export async function collect_source_files(
  entry_path: string,
  diagnostics: Diagnostics,
) {
  const queue = Queue.from([entry_path])
  const source_files: Record<string, SourceFile> = {}
  while (queue.length > 0) {
    const path = Queue.take(queue)
    if (path === null) {
      continue
    }
    const source_text = await fs.readFile(path, "utf-8")
    const source_file = parse_source_file(path, source_text)

    source_files[path] = source_file
    diagnostics.push(path, ...source_file.errors)
    const imports = collect_imports(source_file, diagnostics)
    for (const import_path of imports) {
      if (!(import_path in source_files)) {
        Queue.push(queue, import_path)
      }
    }
  }
  return source_files
}

class CollectImportsVisitor extends ASTVisitorBase {
  #diagnostics: Diagnostics
  #source_file: SourceFile
  readonly imports: string[] = []
  constructor(diagnostics: Diagnostics, source_file: SourceFile) {
    super()
    this.#diagnostics = diagnostics
    this.#source_file = source_file
  }

  override visit_stmt(stmt: Stmt): void {
    if (stmt.kind === "Import") {
      const path = parse_module_specifier(stmt.module_specifier)
      if (!existsSync(path)) {
        this.#diagnostics.push(this.#source_file.path, {
          span: {
            start: stmt.span.stop - stmt.module_specifier.length,
            stop: stmt.span.stop,
          },
          message: `Module not found`,
          hint: "The module path must be a path to a file relative to the current file. For example, if the current file is `src/main.ts`, and you want to import `src/utils.ts`, you should use `./utils.ts` as the module specifier.",
        })
      }
    } else {
      super.visit_stmt(stmt)
    }
  }
}
function collect_imports(
  source_file: SourceFile,
  diagnostics: Diagnostics,
): string[] {
  const visitor = new CollectImportsVisitor(diagnostics, source_file)
  visitor.visit_source_file(source_file)
  return visitor.imports
}
function parse_module_specifier(specifier: string): string {
  const value: unknown = JSON.parse(specifier)
  assert(typeof value === "string", `Invalid module specifier: ${specifier}`)
  return value
}
