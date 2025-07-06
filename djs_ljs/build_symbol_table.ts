import type { Func, FuncStmt, Pattern, SourceFile, Stmt } from "djs_ast"
import { SymbolTable, type ValueDecl } from "./SymbolTable.js"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { assert_never, todo } from "djs_std"

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
export function build_function_symbol_table(stmt: FuncStmt): SymbolTable {
  const symbol_table = new SymbolTable()
  for (const param of stmt.func.params) {
    add_pattern_bindings_to_symbol_table(symbol_table, param.pattern, stmt)
  }
  initialize_symbol_table(symbol_table, stmt.func.body.stmts)
  return symbol_table
}
function add_pattern_bindings_to_symbol_table(
  symbol_table: SymbolTable,
  pattern: Pattern,
  stmt: ValueDecl,
) {
  switch (pattern.kind) {
    case "Var":
      symbol_table.add_value(pattern.ident.text, stmt)
      break
    case "Array":
      for (const item of pattern.items) {
        add_pattern_bindings_to_symbol_table(symbol_table, item, stmt)
      }
      break
    case "Object":
      todo()
    case "Elision":
      break
    case "Rest":
      add_pattern_bindings_to_symbol_table(symbol_table, pattern.pattern, stmt)
      break
    case "Assignment":
      todo()
    case "Prop":
      todo()
    default:
      assert_never(pattern)
  }
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
        for (const named_import of stmt.named_imports) {
          if (named_import.as_name) {
            symbol_table.add_value(named_import.as_name.text, stmt)
          } else if (named_import.imported_name.kind === "Ident") {
            symbol_table.add_value(named_import.imported_name.ident.text, stmt)
          } else {
            todo(`import { "quoted" as name } not supported yet.`)
          }
        }
    }
  }
}
