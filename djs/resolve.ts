import {
  ASTVisitorBase,
  Expr,
  ForStmt,
  Pattern,
  ReturnStmt,
  Stmt,
  TypeAnnotation,
  type Block,
  type Func,
  type Ident,
  type SourceFile,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"
import { assert, assert_never, Stack, TODO } from "djs_std"
import { builtin_types, builtin_values } from "./builtins.ts"
import { SymbolTable } from "./SymbolTable.ts"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import { import_stmt_path } from "./import_stmt_path.ts"
import type { TypeDecl, ValueDecl, ModuleDecl } from "./decl.ts"

export interface ResolveResult {
  diagnostics: Diagnostics
  types: ReadonlyMap<Ident, TypeDecl>
  values: ReadonlyMap<Ident, ValueDecl>
  return_stmt_enclosing_func: Map<ReturnStmt, Func>
}

export function resolve(fs: FS, source_files: SourceFiles): ResolveResult {
  return new Resolver(fs, source_files).run()
}

class Resolver extends ASTVisitorBase {
  source_file_symbols_tables = new Map<SourceFile, SymbolTable>()
  diagnostics: Diagnostics
  source_files: SourceFiles
  _source_file: SourceFile | null = null
  current_func: Func | null = null

  values: Map<Ident, ValueDecl> = new Map()
  types: Map<Ident, TypeDecl> = new Map()

  scope = new Stack<SymbolTable>()
  return_stmt_enclosing_func = new Map<ReturnStmt, Func>()

  constructor(fs: FS, source_files: SourceFiles) {
    super()
    this.diagnostics = new Diagnostics(fs)
    this.source_files = source_files
    this.scope.push(SymbolTable.Global)
  }

  run(): ResolveResult {
    for (const source_file of this.source_files.values()) {
      this.visit_source_file(source_file)
    }

    return {
      diagnostics: this.diagnostics,
      types: this.types,
      values: this.values,
      return_stmt_enclosing_func: this.return_stmt_enclosing_func,
    }
  }

  override visit_source_file(sf: SourceFile) {
    const previous_source_file = this._source_file
    this._source_file = sf
    const symbol_table = this.get_source_file_symbol_table(sf)
    assert(symbol_table, `Missing symbol table for ${sf.path}`)
    this.scope.push(symbol_table)
    super.visit_source_file(sf)

    assert(this.scope.pop() === symbol_table)
    assert(this._source_file === sf)
    this._source_file = previous_source_file
  }
  get_source_file_symbol_table(source_file: SourceFile): SymbolTable {
    const existing = this.source_file_symbols_tables.get(source_file)
    if (existing) {
      return existing
    }
    const symbol_table = build_source_file_symbol_table(this, source_file)
    this.source_file_symbols_tables.set(source_file, symbol_table)
    return symbol_table
  }

  get source_file(): SourceFile {
    assert(this._source_file, "No current source file")
    return this._source_file
  }

  override visit_func(node: Func): void {
    const func_symbol_table = build_function_symbol_table(
      this,
      this.source_file,
      node,
    )
    this.scope.push(func_symbol_table)

    const prev_func = this.current_func
    this.current_func = node

    // The default visit_func implementation calls visit_block,
    // which will push a new scope, however, the function's scope is the
    // same as the block's scope, so can't call super.visit_func here
    // Instead, we manually visit it
    for (const type_param of node.type_params) {
      this.visit_type_param(type_param)
    }
    for (const param of node.params) {
      this.visit_param(param)
    }
    for (const stmt of node.body.stmts) {
      this.visit_stmt(stmt)
    }
    if (node.return_type !== null) {
      this.visit_type_annotation(node.return_type)
    }

    this.current_func = prev_func
    assert(
      this.scope.pop() === func_symbol_table,
      "Expected to pop the current function's symbol table",
    )
  }
  private visit_for_stmt(stmt: ForStmt): void {
    const for_symbol_table = build_for_stmt_symbol_table(this.source_file, stmt)
    this.scope.push(for_symbol_table)
    if (stmt.init.kind === "VarDecl") {
      this.visit_var_decl(stmt.init.decl)
    }
    if (stmt.test !== null) {
      this.visit_expr(stmt.test)
    }
    if (stmt.update !== null) {
      this.visit_expr(stmt.update)
    }
    this.visit_stmt(stmt.body)
    assert(
      this.scope.pop() === for_symbol_table,
      "Expected to pop the current for statement's symbol table",
    )
  }

  override visit_block(block: Block): void {
    const block_symbol_table = build_block_symbol_table(
      this,
      this.source_file,
      block.stmts,
    )
    this.scope.push(block_symbol_table)
    super.visit_block(block)
    assert(
      this.scope.pop() === block_symbol_table,
      "Expected to pop the current block's symbol table",
    )
  }

  override visit_stmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "For": {
        this.visit_for_stmt(stmt)
        break
      }
      case "Return":
        if (this.current_func === null) return
        assert(
          !this.return_stmt_enclosing_func.has(stmt),
          "Return statement already tracked",
        )
        this.return_stmt_enclosing_func.set(stmt, this.current_func)
        super.visit_stmt(stmt)
        break
      default:
        super.visit_stmt(stmt)
    }
  }
  override visit_expr(expr: Expr): void {
    switch (expr.kind) {
      case "Var":
        return this.visit_var_expr(expr.ident)
      default:
        super.visit_expr(expr)
    }
  }

  visit_var_expr(ident: Ident) {
    const value = lookup_value(this.scope, ident)
    if (value) {
      this.values.set(ident, value)
    } else {
      this.diagnostics.push(this.source_file.path, {
        message: `Unbound variable "${ident.text}"`,
        span: ident.span,
        hint: null,
      })
    }
  }

  override visit_type_annotation(type_annotation: TypeAnnotation): void {
    switch (type_annotation.kind) {
      case "Ident":
        if (type_annotation.ident.text === "c") {
          TODO("Handle 'c' type annotation")
        }
        return this.visit_var_type(type_annotation.ident)
      case "Qualified":
        return this.visit_var_type(type_annotation.head)
      default:
        super.visit_type_annotation(type_annotation)
    }
  }
  visit_var_type(ident: Ident): void {
    const ty = lookup_type(this.scope, ident)
    if (ty) {
      this.types.set(ident, ty)
    } else {
      this.diagnostics.push(this.source_file.path, {
        message: `Unbound type "${ident.text}"`,
        span: ident.span,
        hint: null,
      })
    }
  }
}

/**
 * Unlike the build_*_symbol_table functions for source files,
 * we need to receive the symbol table as an out parameter
 * because we insert an empty builder in a separate pass before
 * running the resolver.
 * This ensures that when we encounter an import statement,
 * we can insert a { kind: "Module", symbols: ... } reference
 * to the imported module's symbol table.
 *
 */
function build_source_file_symbol_table(
  resolver: Resolver,
  source_file: SourceFile,
): SymbolTable {
  const symbol_table = new SymbolTable()
  init_symbol_table(resolver, source_file, symbol_table, source_file.stmts)
  return symbol_table
}

function build_block_symbol_table(
  resolver: Resolver,
  source_file: SourceFile,
  stmts: readonly Stmt[],
): SymbolTable {
  const symbol_table = new SymbolTable()
  init_symbol_table(resolver, source_file, symbol_table, stmts)
  return symbol_table
}

function build_function_symbol_table(
  resolver: Resolver,
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
  init_symbol_table(resolver, source_file, symbol_table, func.body.stmts)
  return symbol_table
}
function build_for_stmt_symbol_table(
  source_file: SourceFile,
  stmt: ForStmt,
): SymbolTable
function build_for_stmt_symbol_table(
  source_file: SourceFile,
  stmt: ForStmt,
): SymbolTable {
  const symbol_table = new SymbolTable()
  if (stmt.init.kind === "VarDecl") {
    for (const decl of flatten_var_decl(stmt.init.decl)) {
      symbol_table.add_value(
        decl.name,
        {
          kind: "VarDecl",
          decl: stmt.init.decl,
          name: decl.name,
          source_file: source_file.path,
        },
        /* is_exported */ false,
      )
    }
  }
  return symbol_table
}
function add_pattern_bindings_to_symbol_table(
  symbol_table: SymbolTable,
  pattern: Pattern,
  stmt: ValueDecl,
) {
  switch (pattern.kind) {
    case "Var":
      symbol_table.add_value(pattern.ident.text, stmt, /* is_exported */ false)
      break
    case "Array":
      for (const item of pattern.items) {
        add_pattern_bindings_to_symbol_table(symbol_table, item, stmt)
      }
      break
    case "Object":
      TODO()
    case "Elision":
      break
    case "Rest":
      add_pattern_bindings_to_symbol_table(symbol_table, pattern.pattern, stmt)
      break
    case "Assignment":
    case "Prop":
    case "Deref":
      TODO()
    default:
      assert_never(pattern)
  }
}

function init_symbol_table(
  resolver: Resolver,
  source_file: SourceFile,
  symbol_table: SymbolTable,
  stmts: readonly Stmt[],
): void {
  for (const stmt of stmts) {
    add_stmt_to_symbol_table(resolver, source_file, stmt, symbol_table)
  }
}
function add_stmt_to_symbol_table(
  resolver: Resolver,
  /**
   * The source file containing {@link stmt}
   */
  source_file: SourceFile,
  stmt: Stmt,
  symbol_table: SymbolTable,
): void {
  switch (stmt.kind) {
    case "VarDecl": {
      for (const decl of flatten_var_decl(stmt.decl)) {
        symbol_table.add_value(
          decl.name,
          {
            kind: "VarDecl",
            decl: stmt.decl,
            name: decl.name,
            source_file: source_file.path,
          },
          stmt.decl.is_exported,
        )
      }
      break
    }
    case "Func": {
      if (!stmt.func.name) break
      symbol_table.add_value(
        stmt.func.name.text,
        {
          kind: "Func",
          func: stmt.func,
          source_file: source_file.path,
        },
        stmt.is_exported,
      )
      break
    }
    case "LJSExternConst": {
      symbol_table.add_value(
        stmt.name.text,
        {
          kind: "LJSExternConst",
          stmt: stmt,
          source_file: source_file.path,
        },
        stmt.is_exported,
      )
      break
    }
    case "LJSExternFunction": {
      symbol_table.add_value(
        stmt.name.text,
        {
          kind: "LJSExternFunction",
          stmt: stmt,
          source_file: source_file.path,
        },
        stmt.is_exported,
      )
      break
    }
    case "LJSBuiltinConst": {
      const builtin =
        builtin_values[stmt.name.text as keyof typeof builtin_values]
      if (!builtin) TODO()
      symbol_table.add_value(stmt.name.text, builtin, stmt.is_exported)
      break
    }
    case "LJSBuiltinType": {
      const builtin =
        builtin_types[stmt.name.text as keyof typeof builtin_types]
      if (!builtin) TODO()
      symbol_table.add_type(stmt.name.text, builtin, stmt.is_exported)
      break
    }
    case "TypeAlias": {
      symbol_table.add_type(
        stmt.name.text,
        {
          kind: "TypeAlias",
          stmt: stmt,
          source_file: source_file.path,
        },
        stmt.is_exported,
      )
      break
    }
    case "StructDecl": {
      const decl = {
        kind: "Struct",
        decl: stmt,
        source_file: source_file.path,
      } as const
      symbol_table.add_type(stmt.struct_def.name.text, decl, stmt.is_exported)
      symbol_table.add_value(stmt.struct_def.name.text, decl, stmt.is_exported)
      break
    }
    case "UntaggedUnionDecl": {
      const decl = {
        kind: "UntaggedUnion",
        decl: stmt,
        source_file: source_file.path,
      } as const
      symbol_table.add_type(
        stmt.untagged_union_def.name.text,
        decl,
        stmt.is_exported,
      )
      symbol_table.add_value(
        stmt.untagged_union_def.name.text,
        decl,
        stmt.is_exported,
      )
      break
    }
    case "LJSExternType": {
      symbol_table.add_type(
        stmt.name.text,
        {
          kind: "ExternType",
          stmt: stmt,
          source_file: source_file.path,
        },
        stmt.is_exported,
      )
      break
    }
    case "Import": {
      const imported_source_file = resolver.source_files.get(
        import_stmt_path(source_file, stmt),
      )
      if (!imported_source_file) TODO()
      const imported_file_symbol_table =
        resolver.get_source_file_symbol_table(imported_source_file)
      if (!imported_file_symbol_table) TODO()

      // import { foo, bar } from "..."
      for (const specifier of stmt.named_imports) {
        if (specifier.imported_name.kind === "String")
          TODO(`import { "quoted" as name } from "..."`)
        const value_decl = imported_file_symbol_table.get_value(
          specifier.imported_name.ident.text,
        )
        if (value_decl) {
          symbol_table.add_value(
            specifier.imported_name.ident.text,
            value_decl,
            /* is_exported */ false,
          )
        }
        const type_decl = imported_file_symbol_table.get_type(
          specifier.imported_name.ident.text,
        )
        if (type_decl) {
          symbol_table.add_type(
            specifier.imported_name.ident.text,
            type_decl,
            /* is_exported */ false,
          )
        }
      }
      break
    }
    case "ImportStarAs": {
      const imported_source_file = resolver.source_files.get(
        import_stmt_path(source_file, stmt),
      )
      if (!imported_source_file) TODO()
      const imported_file_symbol_table =
        resolver.get_source_file_symbol_table(imported_source_file)
      if (!imported_file_symbol_table) TODO()
      const module: ModuleDecl = {
        kind: "Module",
        values: imported_file_symbol_table.exported_values,
        types: imported_file_symbol_table.exported_types,

        private_values: imported_file_symbol_table.private_values,
        private_types: imported_file_symbol_table.private_types,
      }

      // import * as foo from "..."
      // foo is not visible outside this source file
      symbol_table.add_value(stmt.as_name.text, module, /* is_exported */ false)
      symbol_table.add_type(stmt.as_name.text, module, /* is_exported */ false)
      break
    }
  }
}

function lookup_value(
  scope: Stack<SymbolTable>,
  ident: Ident,
): ValueDecl | null {
  for (const symbols of scope) {
    const decl = symbols.get_value(ident.text)
    if (decl) return decl
  }
  return null
}
function lookup_type(scope: Stack<SymbolTable>, ident: Ident): TypeDecl | null {
  for (const symbols of scope) {
    const decl = symbols.get_type(ident.text)
    if (decl) return decl
  }
  return null
}
