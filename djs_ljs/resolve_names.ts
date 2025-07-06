import {
  ASTVisitorBase,
  Expr,
  Stmt,
  VarExpr,
  type Block,
  type SourceFile,
} from "djs_ast"
import { AssertionError } from "node:assert"
import { assert } from "node:console"
import * as Stack from "./stack.ts"

type ResolveNamesResult = {
  scopes: Map<SourceFile | Block, SymbolTable>
  values: Map<VarExpr, Stmt>
}
type SymbolTable = {
  values: Map<string, Stmt>
}
const SymbolTable = {
  empty: (): SymbolTable => ({ values: new Map<string, Stmt>() }),
}

export function resolve_names(
  source_files: Record<string, SourceFile>,
): ResolveNamesResult {
  const result: ResolveNamesResult = {
    values: new Map<VarExpr, Stmt>(),
    scopes: new Map<SourceFile | Block, SymbolTable>(),
  }
  const visitor = new ResolveNames(result)

  for (const source_file of Object.values(source_files)) {
    visitor.visit_source_file(source_file)
  }
  return result
}

class ResolveNames extends ASTVisitorBase {
  #result: ResolveNamesResult
  #scopes: Stack.t<SymbolTable> = Stack.empty<SymbolTable>()
  constructor(result: ResolveNamesResult) {
    super()
    this.#result = result
  }

  override visit_source_file(node: SourceFile): void {
    assert(!this.#result.scopes.has(node))
    assert(
      this.#scopes.length === 0,
      "Current scope should be null at the start",
    )
    const this_scope = SymbolTable.empty()
    Stack.push(this.#scopes, this_scope)
    this.#result.scopes.set(node, this_scope)
    populate_source_file_scope(node, this_scope)

    super.visit_source_file(node)

    assert(
      Stack.pop(this.#scopes) === this_scope,
      "Current scope should be the same after visiting",
    )
  }

  override visit_block(node: Block): void {
    const previous_scope = Stack.peek(this.#scopes)
    const this_scope = SymbolTable.empty()

    Stack.push(this.#scopes, this_scope)
    this.#result.scopes.set(node, this_scope)

    populate_block_scope(node, this_scope)

    super.visit_block(node)

    assert(
      Stack.pop(this.#scopes) === this_scope,
      "Current scope should be the same after visiting block",
    )
    assert(Stack.peek(this.#scopes) === previous_scope)
  }

  override visit_expr(expr: Expr): void {
    switch (expr.kind) {
      case "Var": {
        const decl = this.#lookup_value(expr)
        if (!decl) {
          todo(`Unbound variable: ${expr.ident.text}`)
        }
        this.#result.values.set(expr, decl)
        break
      }
      default:
        super.visit_expr(expr)
    }
  }

  #lookup_value(expr: VarExpr): Stmt | null {
    for (const item of Stack.iter(this.#scopes)) {
      const decl = item.values.get(expr.ident.text)
      if (decl) {
        return decl
      }
    }
    return null
  }
}

function populate_source_file_scope(
  source_file: SourceFile,
  scope: SymbolTable,
) {
  populate_statement_list_scope(source_file.stmts, scope)
}

function populate_block_scope(block: Block, scope: SymbolTable): void {
  populate_statement_list_scope(block.stmts, scope)
}

function populate_statement_list_scope(
  stmts: readonly Stmt[],
  scope: SymbolTable,
) {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "Func":
        if (stmt.func.name) {
          assert(
            !scope.values.has(stmt.func.name.text),
            `Function "${stmt.func.name.text}" is already defined in the current scope`,
          )
          scope.values.set(stmt.func.name.text, stmt)
        }
        break
      case "VarDecl":
      case "ClassDecl":
      case "Import":
        return todo(stmt.kind)
    }
  }
}

function todo(message: string | null = null): never {
  throw new AssertionError({
    message: message ? `TODO(${message})` : "TODO",
    stackStartFn: todo,
  })
}
