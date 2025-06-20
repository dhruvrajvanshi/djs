import type { ClassDeclStmt, FuncStmt, SourceFile, VarDeclStmt } from "djs_ast"
import { Diagnostics } from "./diagnostics.js"
import assert from "node:assert/strict"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { assert_todo } from "djs_std"

type ResolveTopLevelResult = {
  diagnostics: Diagnostics
  source_file_value_decls: Map<SourceFile, Map<string, ValueDeclStmt>>
}
type ValueDeclStmt = FuncStmt | VarDeclStmt | ClassDeclStmt

type ResolveTopLevelState = {
  diagnostics: Diagnostics
  source_file_value_decls: Map<SourceFile, Map<string, ValueDeclStmt>>
}
export function resolve_top_level(
  source_files: Record<string, SourceFile>,
): ResolveTopLevelResult {
  const self: ResolveTopLevelState = {
    diagnostics: new Diagnostics(),
    source_file_value_decls: new Map(),
  }
  collect_module_values_decls(self, source_files)

  return {
    source_file_value_decls: self.source_file_value_decls,
    diagnostics: self.diagnostics,
  }
}
function collect_module_values_decls(
  self: ResolveTopLevelState,
  source_files: Record<string, SourceFile>,
) {
  for (const source_file of Object.values(source_files)) {
    assert(
      !self.source_file_value_decls.has(source_file),
      `Duplicate source file ${source_file.path}`,
    )
    const module_values_decls = new Map<string, ValueDeclStmt>()
    self.source_file_value_decls.set(source_file, module_values_decls)
    for (const stmt of source_file.stmts) {
      switch (stmt.kind) {
        case "VarDecl": {
          const flattened = flatten_var_decl(stmt)
          for (const decl of flattened) {
            assert_todo(
              !module_values_decls.has(decl.name),
              `Duplicate variable declaration ${decl.name} in ${source_file.path}`,
            )
            module_values_decls.set(decl.name, stmt)
          }
          break
        }
        case "Func": {
          const func = stmt.func
          if (!func.name) break
          assert_todo(
            !module_values_decls.has(func.name.text),
            `Duplicate function declaration ${func.name.text} in ${source_file.path}`,
          )
          module_values_decls.set(func.name.text, stmt)
        }

        default:
      }
    }
  }
}
