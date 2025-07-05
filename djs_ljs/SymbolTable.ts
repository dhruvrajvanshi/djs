import type {
  ClassDeclStmt,
  FuncStmt,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  VarDeclStmt,
} from "djs_ast"
import assert from "node:assert"

type ValueDecl =
  | VarDeclStmt
  | FuncStmt
  | ClassDeclStmt
  | LJSExternFunctionStmt
  | ImportStmt
  | ImportStarAsStmt

export class SymbolTable {
  private symbols = new Map<string, ValueDecl>()

  add(name: string, decl: ValueDecl): void {
    assert(
      !this.symbols.has(name),
      `Symbol '${name}' already exists in the symbol table.`,
    )
    this.symbols.set(name, decl)
  }

  get(name: string): ValueDecl | undefined {
    return this.symbols.get(name)
  }
}
