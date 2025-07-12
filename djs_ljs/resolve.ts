import {
  ASTVisitorBase,
  Expr,
  TypeAnnotation,
  type Block,
  type Func,
  type Ident,
  type SourceFile,
} from "djs_ast"
import { SymbolTable, type TypeDecl, type ValueDecl } from "./SymbolTable.ts"
import {
  build_block_symbol_table,
  build_function_symbol_table,
  build_source_file_symbol_table,
} from "./build_symbol_table.ts"
import assert from "node:assert"
import { Diagnostics } from "./diagnostics.ts"
import type { FS } from "./FS.ts"

interface ResolveResult {
  values: Map<Ident, ValueDecl>
  types: Map<Ident, TypeDecl>
  diagnostics: Diagnostics
}

export function resolve(fs: FS, source_file: SourceFile): ResolveResult {
  const resolver = new Resolver(fs, source_file)
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

  constructor(fs: FS, source_file: SourceFile) {
    super()
    this.source_file = source_file
    this.diagnostics = new Diagnostics(fs)
    this.scope = new Stack<SymbolTable>()
    this.scope.push(SymbolTable.Global)
    this.values = new Map<Ident, ValueDecl>()
    this.types = new Map<Ident, TypeDecl>()
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

    assert(
      this.scope.pop() === func_symbol_table,
      "Expected to pop the current function's symbol table",
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

  override visit_expr(expr: Expr): void {
    switch (expr.kind) {
      case "Var":
        return this.visit_var_expr(expr.ident)
      default:
        super.visit_expr(expr)
    }
  }

  override visit_type_annotation(type_annotation: TypeAnnotation): void {
    switch (type_annotation.kind) {
      case "Ident":
        return this.visit_var_type(type_annotation.ident)
      default:
        super.visit_type_annotation(type_annotation)
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
