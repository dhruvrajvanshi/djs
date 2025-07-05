import type { Func, SourceFile, Stmt } from "djs_ast"
import { SymbolTable } from "./SymbolTable.js"
import { flatten_var_decl } from "./flatten_var_decl.ts"

export function build_source_file_symbol_table(
  source_file: SourceFile,
): SymbolTable {
  const symbol_table = new SymbolTable()
  initialize_symbol_table(symbol_table, source_file.stmts)
  return symbol_table
}
export function build_block_symbol_table(stmts: readonly Stmt[]): SymbolTable {
  const symbol_table = new SymbolTable()
  initialize_symbol_table(symbol_table, stmts)
  return symbol_table
}
export function build_function_symbol_table(func: Func): SymbolTable {
  const symbol_table = new SymbolTable()
  initialize_symbol_table(symbol_table, func.body.stmts)
  return symbol_table
}

function initialize_symbol_table(
  symbol_table: SymbolTable,
  stmts: readonly Stmt[],
) {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "VarDecl":
        for (const decl of flatten_var_decl(stmt)) {
          symbol_table.add_value(decl.name, stmt)
        }
        break
      case "Func":
        if (!stmt.func.name) break
        symbol_table.add_value(stmt.func.name.text, stmt)
        break
      case "ClassDecl":
        if (!stmt.class_def.name) break
        symbol_table.add_value(stmt.class_def.name.text, stmt)
        break
      case "LJSExternFunction": {
        if (!stmt.name) break
        symbol_table.add_value(stmt.name.text, stmt)
        break
      }
      case "Import":
        if (stmt.default_import) {
          symbol_table.add_value(stmt.default_import.text, stmt)
        }
    }
  }
}
