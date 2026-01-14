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

function calculate_qualified_name(
  entry_path: string,
  file_path: string,
): QualifiedName {
  if (entry_path === file_path) {
    return QualifiedName()
  }

  const entry_dir = Path.dirname(entry_path)
  const relative_path = Path.relative(entry_dir, file_path)

  // Handle paths outside the entry file directory
  if (relative_path.startsWith("..")) {
    // Use "external" prefix for files outside entry directory
    // First remove the file extension
    const without_ext = relative_path.replace(/\.[^./\\]*$/, "")
    // Then replace .. with external and path separators with underscores
    const normalized = without_ext
      .replace(/\.\./g, "external")
      .replace(/[/\\]/g, "_")
    const parts = normalized.split("_").filter((part) => part.length > 0)
    return QualifiedName(...parts)
  }

  // Convert path to qualified name parts, removing file extension
  const without_ext = relative_path.replace(/\.[^.]*$/, "")
  const parts = without_ext
    .split(/[/\\]/)
    .filter((part) => part.length > 0 && part !== ".")
  return QualifiedName(...parts)
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
  const absolute_entry_path = fs.to_absolute(entry_path)
  const queue = Queue.from<Entry>([
    {
      path: absolute_entry_path,
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
    const qualified_name = calculate_qualified_name(absolute_entry_path, path)
    const source_file = parse_source_file(qualified_name, path, source_text)

    source_files.set(path, source_file)
    diagnostics.push(path, ...source_file.errors)

    const imports = collect_imports(source_file)
    for (const import_stmt of imports) {
      const module_specifier = parse_module_specifier(
        import_stmt.module_specifier,
      )
      let imported_path: string
      if (module_specifier.startsWith("ljs:")) {
        const path = module_specifier.slice("ljs:".length)
        imported_path = Path.join(import.meta.dirname, "stdlib", `${path}.ljs`)
      } else {
        imported_path = fs.to_absolute(
          Path.join(Path.dirname(source_file.path), module_specifier),
        )
      }
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
