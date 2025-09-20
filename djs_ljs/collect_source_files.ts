import {
  ASTVisitorBase,
  ImportStarAsStmt,
  ImportStmt,
  QualifiedName,
  type SourceFile,
  type Stmt,
} from "djs_ast"
import { parse_source_file } from "djs_parser"
import { Diagnostics } from "./diagnostics.ts"
import * as Queue from "./queue.ts"
import assert from "node:assert"
import { FS } from "./FS.ts"
import { exit } from "node:process"
import Path from "node:path"
import { type SourceFiles } from "./SourceFiles.ts"
import { PathMap } from "./PathMap.ts"

export type CollectSourceFilesResult = {
  source_files: SourceFiles
  diagnostics: Diagnostics
}

export async function collect_source_files(
  entry_path: string,
  fs: FS,
): Promise<CollectSourceFilesResult> {
  const diagnostics = new Diagnostics(fs)
  type ImportInfo = {
    stmt: ImportStmt | ImportStarAsStmt
    imported_from: SourceFile
  }
  type Entry = {
    /* absolute path */
    path: string
    import_info: ImportInfo | null
  }
  const queue = Queue.from<Entry>([
    {
      path: fs.to_absolute(entry_path),
      import_info: null,
    },
  ])
  const source_files = new PathMap<SourceFile>(fs)
  while (queue.length > 0) {
    const { path, import_info } = Queue.take(queue)

    let source_text = ""
    try {
      source_text = await fs.read_file(path, "utf-8")
    } catch (error) {
      if (import_info) {
        const imported_path = parse_module_specifier(
          import_info.stmt.module_specifier,
        )
        diagnostics.push(import_info.imported_from.path, {
          message: `Failed to import module "${imported_path}"`,
          span: import_info.stmt.span,
          hint: `You must specify a path relative to ${import_info.imported_from.path}`,
        })
      } else {
        console.error(`Could not read the file "${path}"`)
        exit(1)
      }
      continue
    }
    const source_file = parse_source_file(QualifiedName(), path, source_text)

    source_files.set(path, source_file)
    diagnostics.push(path, ...source_file.errors)

    const imports = collect_imports(source_file)
    for (const import_stmt of imports) {
      const imported_path = fs.to_absolute(
        Path.join(
          Path.dirname(source_file.path),
          parse_module_specifier(import_stmt.module_specifier),
        ),
      )
      if (imported_path in source_files) continue

      queue.push({
        path: imported_path,
        import_info: {
          imported_from: source_file,
          stmt: import_stmt,
        },
      })
    }
  }
  return { source_files, diagnostics }
}

class CollectImportsVisitor extends ASTVisitorBase {
  readonly imports: (ImportStmt | ImportStarAsStmt)[] = []
  override visit_stmt(stmt: Stmt): void {
    if (stmt.kind === "Import" || stmt.kind === "ImportStarAs") {
      this.imports.push(stmt)
    } else {
      super.visit_stmt(stmt)
    }
  }
}
function collect_imports(
  source_file: SourceFile,
): (ImportStmt | ImportStarAsStmt)[] {
  const visitor = new CollectImportsVisitor()
  visitor.visit_source_file(source_file)
  return visitor.imports
}
function parse_module_specifier(specifier: string): string {
  const value: unknown = JSON.parse(specifier)
  assert(typeof value === "string", `Invalid module specifier: ${specifier}`)
  return value
}
