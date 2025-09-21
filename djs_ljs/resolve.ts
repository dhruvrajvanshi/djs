import {
  AssignExpr,
  ASTVisitorBase,
  Expr,
  ForStmt,
  Pattern,
  TypeAnnotation,
  type Block,
  type Func,
  type Ident,
  type ReturnStmt,
  type SourceFile,
  type Stmt,
} from "djs_ast"
import {
  SymbolTable,
  type TypeDecl,
  type TypeDeclExcludingKind,
  type ValueDecl,
  type ValueDeclExcludingKind,
} from "./SymbolTable.ts"
import {
  build_block_symbol_table,
  build_for_stmt_symbol_table,
  build_function_symbol_table,
  build_source_file_symbol_table,
} from "./build_symbol_table.ts"
import assert from "node:assert"
import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"
import type { SourceFiles } from "./SourceFiles.ts"
import { PathMap } from "./PathMap.ts"
import { resolve_imports } from "./resolve_imports.ts"
import { todo } from "djs_std"

export interface ResolveResult {
  values: PathMap<Map<Ident, ValueDeclExcludingKind<"Import" | "ImportStarAs">>>
  types: PathMap<Map<Ident, TypeDeclExcludingKind<"Import" | "ImportStarAs">>>
  return_stmt_enclosing_func: Map<ReturnStmt, Func>
  diagnostics: Diagnostics
}
export function resolve(fs: FS, source_files: SourceFiles): ResolveResult {
  const values = new PathMap<Map<Ident, ValueDecl>>(fs)
  const types = new PathMap<Map<Ident, TypeDecl>>(fs)
  const return_stmt_enclosing_func = new Map<ReturnStmt, Func>()
  const diagnostics: Diagnostics[] = []
  for (const source_file of source_files.values()) {
    const result = resolve_source_file(
      fs,
      source_file,
      return_stmt_enclosing_func,
    )
    diagnostics.push(result.diagnostics)
    types.set(source_file.path, result.types)
    values.set(source_file.path, result.values)
  }
  const resolved_imports = resolve_imports(source_files, {
    values,
    types,
  })

  return {
    values: resolved_imports.values,
    types: resolved_imports.types,
    return_stmt_enclosing_func,
    diagnostics: Diagnostics.merge(...diagnostics),
  }
}

interface ResolveSourceFileResult {
  values: Map<Ident, ValueDecl>
  types: Map<Ident, TypeDecl>
  diagnostics: Diagnostics
}

export function resolve_source_file(
  fs: FS,
  source_file: SourceFile,
  return_stmt_enclosing_func: Map<ReturnStmt, Func>,
): ResolveSourceFileResult {
  const resolver = new Resolver(fs, source_file, return_stmt_enclosing_func)
  resolver.visit_source_file(source_file)

  return {
    values: resolver.values,
    diagnostics: resolver.diagnostics,
    types: resolver.types,
  }
}
class Resolver extends ASTVisitorBase {
  scope: Stack<SymbolTable>
  values: Map<Ident, ValueDecl>
  types: Map<Ident, TypeDecl>
  diagnostics: Diagnostics
  source_file: SourceFile
  return_stmt_enclosing_func: Map<ReturnStmt, Func>
  current_func: Func | null = null

  constructor(
    fs: FS,
    source_file: SourceFile,
    return_stmt_enclosing_func: Map<ReturnStmt, Func>,
  ) {
    super()
    this.source_file = source_file
    this.diagnostics = new Diagnostics(fs)
    this.scope = new Stack<SymbolTable>()
    this.scope.push(SymbolTable.Global)
    this.values = new Map<Ident, ValueDecl>()
    this.types = new Map<Ident, TypeDecl>()
    this.return_stmt_enclosing_func = return_stmt_enclosing_func
  }

  override visit_source_file(source_file: SourceFile): void {
    assert(this.source_file === source_file, "Source file mismatch")
    const this_symbol_table = build_source_file_symbol_table(source_file)
    this.scope.push(this_symbol_table)
    super.visit_source_file(source_file)
    assert(this.scope.pop() === this_symbol_table, "Scope stack mismatch")
    assert(
      this.scope.peek() === SymbolTable.Global,
      "Expected global scope at the end",
    )
  }

  override visit_func(node: Func): void {
    const func_symbol_table = build_function_symbol_table(
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
      case "Assign":
        return this.visit_assign_expr(expr)
      default:
        super.visit_expr(expr)
    }
  }

  override visit_type_annotation(type_annotation: TypeAnnotation): void {
    switch (type_annotation.kind) {
      case "Ident":
        return this.visit_var_type(type_annotation.ident)
      case "Qualified":
        return this.visit_var_type(type_annotation.head)
      default:
        super.visit_type_annotation(type_annotation)
    }
  }

  visit_assign_expr(expr: AssignExpr): void {
    this.bind_pattern_idents(expr.pattern)
    if (expr.pattern.kind !== "Var") {
      todo()
    }
    this.visit_var_expr(expr.pattern.ident)
    super.visit_expr(expr)
  }

  bind_pattern_idents(pattern: Pattern): void {
    switch (pattern.kind) {
      case "Var":
        break
    }
  }

  visit_var_expr(ident: Ident): void {
    const value = this.get_value(ident)
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
  visit_var_type(ident: Ident): void {
    const ty = this.get_type(ident)
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

  get_value(ident: Ident): ValueDecl | undefined {
    for (const scope of this.scope) {
      const value = scope.get_value(ident.text)
      if (value) {
        return value
      }
    }
    return undefined
  }
  get_type(ident: Ident): TypeDecl | undefined {
    for (const scope of this.scope) {
      const type = scope.get_type(ident.text)
      if (type) {
        return type
      }
    }
    return undefined
  }
}

class Stack<T> {
  private items: T[] = []

  push(item: T) {
    this.items.push(item)
  }

  pop(): T | undefined {
    return this.items.pop()
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1]
  }
  is_empty(): boolean {
    return this.items.length === 0
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = this.items.length - 1; i >= 0; i--) {
      yield this.items[i]
    }
  }
}
