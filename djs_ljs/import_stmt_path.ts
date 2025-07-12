import type { ImportStarAsStmt, ImportStmt, SourceFile } from "djs_ast"
import type { FS } from "./FS.ts"
import Path from "node:path"
import assert from "node:assert"

/**
 * Returns an absolute path to the file that is imported.
 * This is useful to resolve import statements to a declaration in the imported file.
 * @example
 *   // in file /some/path/x.djs
 *   import { foo } from "./foo.djs"
 *
 *  import_stmt_path(fs, SourceFile("/some/path/x.djs"), ImportStmt("import { foo } from './foo.djs'"))
 *    => "/some/path/foo.djs"
 */
export function import_stmt_path(
  fs: FS,
  /**
   * The file which contains the import statement.
   */
  source_file: SourceFile,
  stmt: ImportStmt | ImportStarAsStmt,
) {
  const value = JSON.parse(stmt.module_specifier)
  assert(
    typeof value === "string",
    `Invalid module specifier: ${stmt.module_specifier}`,
  )
  return fs.to_absolute(Path.join(Path.dirname(source_file.path), value))
}
