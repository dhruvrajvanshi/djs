import {
  ASTVisitorBase,
  ClassDeclStmt,
  Expr,
  ForStmt,
  LJSExternConstStmt,
  LJSExternFunctionStmt,
  LJSExternTypeStmt,
  Pattern,
  ReturnStmt,
  Stmt,
  StructDeclStmt,
  TypeAliasStmt,
  TypeAnnotation,
  UntaggedUnionDeclStmt,
  type Block,
  type Func,
  type Ident,
  type SourceFile,
  type VarDecl,
} from "djs_ast"
import type { SourceFiles } from "./SourceFiles.ts"
import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"
import { PathMap } from "./PathMap.ts"
import { assert, assert_never, Stack, TODO } from "djs_std"
import { flatten_var_decl } from "./flatten_var_decl.ts"
import {
  builtin_types,
  builtin_values,
  type BuiltinConstDecl,
  type BuiltinTypeDecl,
} from "./builtins.ts"
import { Type } from "./type.ts"
import { import_stmt_path } from "./import_stmt_path.ts"

export interface ResolveResult {
  diagnostics: Diagnostics
  types: ReadonlyMap<Ident, TypeDecl>
  values: ReadonlyMap<Ident, ValueDecl>
  return_stmt_enclosing_func: Map<ReturnStmt, Func>
}

export type ValueDecl =
  | {
      kind: "VarDecl"
      decl: VarDecl
      name: string
      source_file: string
    }
  | { kind: "Func"; func: Func; source_file: string }
  | { kind: "Param"; func: Func; param_index: number; source_file: string }
  | ClassDeclStmt
  | { kind: "Struct"; decl: StructDeclStmt; source_file: string }
  | { kind: "UntaggedUnion"; decl: UntaggedUnionDeclStmt; source_file: string }
  | {
      kind: "LJSExternFunction"
      stmt: LJSExternFunctionStmt
      source_file: string
    }
  | {
      kind: "LJSExternConst"
      stmt: LJSExternConstStmt
      source_file: string
    }
  | BuiltinConstDecl
  | ModuleDecl
  | {
      kind: "ModuleProp"
      module: ModuleDecl
      name: string
    }

export interface ModuleDecl {
  kind: "Module"
  values: ReadonlyMap<string, ValueDecl>
  types: ReadonlyMap<string, TypeDecl>
}

export type TypeDecl =
  | {
      kind: "TypeAlias"
      stmt: TypeAliasStmt
      source_file: string
    }
  | { kind: "Builtin"; type: Type }
  | {
      kind: "Struct"
      decl: StructDeclStmt
      source_file: string
    }
  | {
      kind: "UntaggedUnion"
      decl: UntaggedUnionDeclStmt
      source_file: string
    }
  | {
      kind: "ExternType"
      stmt: LJSExternTypeStmt
      source_file: string
    }
  | BuiltinTypeDecl
  /**
   * Introduced after resolving imports
   * See the comment in ValueDecl for more details.
   */
  | ModuleDecl
  | {
      kind: "ModuleProp"
      module: ModuleDecl
      name: string
    }

class SymbolTableBuilder {
  values = new Map<string, ValueDecl>()
  types = new Map<string, TypeDecl>()
  name: string

  constructor(name: string) {
    this.name = name
  }

  add_value(name: string, decl: ValueDecl): void {
    this.values.set(name, decl)
  }
  add_type(name: string, decl: TypeDecl): void {
    this.types.set(name, decl)
  }
}

interface SymbolTable {
  /**
   * Only used for debugging
   */
  name: string
  values: ReadonlyMap<string, ValueDecl>
  types: ReadonlyMap<string, TypeDecl>
}
export function resolve(fs: FS, source_files: SourceFiles): ResolveResult {
  return new Resolver(fs, source_files).run()
}

class Resolver extends ASTVisitorBase {
  source_file_symbols: PathMap<SymbolTableBuilder>
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
    this.source_file_symbols = new PathMap(fs)
    this.diagnostics = new Diagnostics(fs)
    this.source_files = source_files
    this.scope.push(GlobalSymbolTable)
  }

  run(): ResolveResult {
    // Phase 1: Insert empty symbol tables for each source file.
    // This means that import * as foo from "./bar.djs" can
    // set the symbol for foo as { kind: "Module", symbols: // symbol table for "bar.djs" }
    for (const source_file of this.source_files.values()) {
      this.source_file_symbols.set(
        source_file.path,
        new SymbolTableBuilder(`SourceFile(${source_file.path}`),
      )
    }
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
    assert(this.scope.peek() === GlobalSymbolTable)
    assert(
      !this._source_file,
      "visit_source_file called when already visiting a source file",
    )
    this._source_file = sf
    const symbol_table = this.source_file_symbols.get(sf.path)
    assert(symbol_table, `Missing symbol table for ${sf.path}`)
    this.scope.push(symbol_table)

    init_source_file_symbol_table(this, symbol_table, sf)
    super.visit_source_file(sf)

    assert(this.scope.pop() === symbol_table)
    this._source_file = null
  }

  get source_file(): SourceFile {
    assert(this._source_file, "No current source file")
    return this._source_file
  }

  override visit_func(node: Func): void {
    const func_symbol_table = init_function_symbol_table(
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
function lookup_value(
  scope: Stack<SymbolTable>,
  ident: Ident,
): ValueDecl | null {
  let trace = process.env.LJS_TRACE_SYMBOL_LOOKUP === ident.text

  for (const symbols of scope) {
    const value = symbols.values.get(ident.text)
    if (value) {
      return value
    } else {
      if (trace) {
        console.log(
          `lookup_value: ${ident.text} not found in symbol table ${symbols.name} with values: ${[
            ...symbols.values.keys(),
          ].join(", ")}`,
        )
      }
    }
  }
  return null
}
function lookup_type(scope: Stack<SymbolTable>, ident: Ident): TypeDecl | null {
  for (const symbols of scope) {
    const ty = symbols.types.get(ident.text)
    if (ty) {
      return ty
    }
  }
  return null
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
function init_source_file_symbol_table(
  resolver: Resolver,
  symbol_table: SymbolTableBuilder,
  source_file: SourceFile,
): void {
  init_symbol_table(resolver, source_file, symbol_table, source_file.stmts)
}

function build_block_symbol_table(
  resolver: Resolver,
  source_file: SourceFile,
  stmts: readonly Stmt[],
): SymbolTable {
  const symbol_table = new SymbolTableBuilder(
    `Block(file = ${source_file.path})`,
  )
  init_symbol_table(resolver, source_file, symbol_table, stmts)
  return symbol_table
}

function init_function_symbol_table(
  resolver: Resolver,
  source_file: SourceFile,
  func: Func,
): SymbolTable {
  const symbol_table = new SymbolTableBuilder(`function(${func.name})`)
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
): SymbolTable {
  const symbol_table = new SymbolTableBuilder(`for-stmt in ${source_file.path}`)
  if (stmt.init.kind === "VarDecl") {
    for (const decl of flatten_var_decl(stmt.init.decl)) {
      symbol_table.add_value(decl.name, {
        kind: "VarDecl",
        decl: stmt.init.decl,
        name: decl.name,
        source_file: source_file.path,
      })
    }
  }
  return symbol_table
}
function add_pattern_bindings_to_symbol_table(
  symbol_table: SymbolTableBuilder,
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
  resolver: Omit<Resolver, "source_file_symbols"> & {
    // Making source_file_symbols read-only to prevent accidental mutation
    // This method should only write to the passed symbol_table parameter
    // This catches a real bug where I was mutating resolver.source_file_symbols.get(imported_path)
    source_file_symbols: PathMap<SymbolTable>
  },
  /**
   * This source file is the one that contains {@link stmts}
   */
  source_file: SourceFile,
  symbol_table: SymbolTableBuilder,
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
      case "LJSExternConst": {
        symbol_table.add_value(stmt.name.text, {
          kind: "LJSExternConst",
          stmt,
          source_file: source_file.path,
        })
        break
      }
      case "LJSExternType": {
        symbol_table.add_type(stmt.name.text, {
          kind: "ExternType",
          stmt,
          source_file: source_file.path,
        })
        break
      }
      case "Import": {
        if (stmt.default_import) {
          TODO()
        }
        const imported_symbol_table = resolver.source_file_symbols.get(
          import_stmt_path(source_file, stmt),
        )
        if (!imported_symbol_table) {
          // Diagnostic will be reported in `collect_source_files`
          break
        }
        const decl: ModuleDecl = {
          kind: "Module",
          values: imported_symbol_table.values,
          types: imported_symbol_table.types,
        }
        for (const named_import of stmt.named_imports) {
          if (named_import.as_name) {
            TODO(`import { name as alias } not supported yet.`)
          } else if (named_import.imported_name.kind === "Ident") {
            symbol_table.add_value(named_import.imported_name.ident.text, {
              kind: "ModuleProp",
              module: decl,
              name: named_import.imported_name.ident.text,
            })
            symbol_table.add_type(named_import.imported_name.ident.text, {
              kind: "ModuleProp",
              module: decl,
              name: named_import.imported_name.ident.text,
            })
          } else {
            TODO(`import { "quoted" as name } not supported yet.`)
          }
        }
        break
      }
      case "ImportStarAs": {
        const path = import_stmt_path(source_file, stmt)
        const symbols = resolver.source_file_symbols.get(path)
        if (!symbols) {
          // Diagnostic will be reported in `collect_source_files`
          break
        }
        symbol_table.add_value(stmt.as_name.text, {
          kind: "Module",
          values: symbols.values,
          types: symbols.types,
        })
        symbol_table.add_type(stmt.as_name.text, {
          kind: "Module",
          values: symbols.values,
          types: symbols.types,
        })

        break
      }
      case "UntaggedUnionDecl":
        symbol_table.add_value(stmt.untagged_union_def.name.text, {
          kind: "UntaggedUnion",
          decl: stmt,
          source_file: source_file.path,
        })
        symbol_table.add_type(stmt.untagged_union_def.name.text, {
          kind: "UntaggedUnion",
          decl: stmt,
          source_file: source_file.path,
        })
        break
      case "TypeAlias": {
        symbol_table.add_type(stmt.name.text, {
          kind: "TypeAlias",
          stmt,
          source_file: source_file.path,
        })
        break
      }
      case "LJSBuiltinConst": {
        if (stmt.name.text in builtin_values) {
          symbol_table.add_value(
            stmt.name.text,
            builtin_values[stmt.name.text as keyof typeof builtin_values],
          )
        }
        break
      }
      case "LJSBuiltinType": {
        if (stmt.name.text in builtin_types) {
          symbol_table.add_type(
            stmt.name.text,
            builtin_types[stmt.name.text as keyof typeof builtin_types],
          )
        }
        break
      }
    }
  }
}
const _GlobalSymbolTable = new SymbolTableBuilder("<global>")
{
  const ty = (name: string, type: Type) =>
    _GlobalSymbolTable.add_type(name, { kind: "Builtin", type })
  ty("u8", Type.u8)
  ty("u16", Type.u16)
  ty("u32", Type.u32)
  ty("u64", Type.u64)
  ty("i8", Type.i8)
  ty("i16", Type.i16)
  ty("i32", Type.i32)
  ty("i64", Type.i64)
  ty("f32", Type.f32)
  ty("f64", Type.f64)
  ty("void", Type.void)
  ty("boolean", Type.boolean)
  ty("unknown", Type.Unknown)
}
const GlobalSymbolTable: SymbolTable = _GlobalSymbolTable
