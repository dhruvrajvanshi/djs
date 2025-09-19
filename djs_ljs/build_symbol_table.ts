import type { Func, Pattern, SourceFile, Stmt } from "djs_ast"
import { SymbolTable, type ValueDecl } from "./SymbolTable.ts"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { assert_never, todo } from "djs_std"
import { import_stmt_path } from "./import_stmt_path.ts"

export function build_source_file_symbol_table(
  source_file: SourceFile,
): SymbolTable {
  const symbol_table = new SymbolTable()
  initialize_symbol_table(source_file, symbol_table, source_file.stmts)
  return symbol_table
}
export function build_block_symbol_table(
  source_file: SourceFile,
  stmts: readonly Stmt[],
): SymbolTable {
  const symbol_table = new SymbolTable()
  initialize_symbol_table(source_file, symbol_table, stmts)
  return symbol_table
}
export function build_function_symbol_table(
  source_file: SourceFile,
  func: Func,
): SymbolTable {
  const symbol_table = new SymbolTable()
  let index = -1
  for (const param of func.params) {
    index++
    add_pattern_bindings_to_symbol_table(symbol_table, param.pattern, {
      kind: "Param",
      func,
      param_index: index,
      source_file: source_file.path,
    })
  }
  initialize_symbol_table(source_file, symbol_table, func.body.stmts)
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
  source_file: SourceFile,
  symbol_table: SymbolTable,
  stmts: readonly Stmt[],
) {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "VarDecl":
        for (const decl of flatten_var_decl(stmt.decl)) {
          symbol_table.add_value(decl.name, {
            kind: "VarDecl",
            decl: stmt.decl,
            name: decl.name,
            source_file: source_file.path,
          })
        }
        break
      case "Func":
        if (!stmt.func.name) break
        symbol_table.add_value(stmt.func.name.text, {
          kind: "Func",
          func: stmt.func,
          source_file: source_file.path,
        })
        break
      case "ClassDecl":
        if (!stmt.class_def.name) break
        symbol_table.add_value(stmt.class_def.name.text, stmt)
        break
      case "StructDecl":
        symbol_table.add_value(stmt.struct_def.name.text, {
          kind: "Struct",
          decl: stmt,
          source_file: source_file.path,
        })
        symbol_table.add_type(stmt.struct_def.name.text, {
          kind: "Struct",
          decl: stmt,
          source_file: source_file.path,
        })
        break
      case "LJSExternFunction": {
        if (!stmt.name) break
        symbol_table.add_value(stmt.name.text, {
          kind: "LJSExternFunction",
          stmt,
          source_file: source_file.path,
        })
        break
      }
      case "Import":
        const decl = {
          kind: "Import",
          stmt,
          imported_file: import_stmt_path(source_file, stmt),
        } as const
        if (stmt.default_import) {
          symbol_table.add_value(stmt.default_import.text, decl)
        }
        for (const named_import of stmt.named_imports) {
          if (named_import.as_name) {
            symbol_table.add_value(named_import.as_name.text, decl)
          } else if (named_import.imported_name.kind === "Ident") {
            symbol_table.add_value(named_import.imported_name.ident.text, decl)
            symbol_table.add_type(named_import.imported_name.ident.text, decl)
          } else {
            todo(`import { "quoted" as name } not supported yet.`)
          }
        }
        break
      case "ImportStarAs": {
        const decl = {
          kind: "ImportStarAs",
          stmt,
          imported_file: import_stmt_path(source_file, stmt),
        } as const
        symbol_table.add_value(stmt.as_name.text, decl)
        symbol_table.add_type(stmt.as_name.text, decl)
        break
      }
      case "TypeAlias": {
        symbol_table.add_type(stmt.name.text, {
          kind: "TypeAlias",
          stmt,
          source_file: source_file.path,
        })
      }
    }
  }
}
