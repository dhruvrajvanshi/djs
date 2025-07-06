import type {
  ClassDeclStmt,
  FuncStmt,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  VarDeclStmt,
} from "djs_ast"
import assert from "node:assert"

export type ValueDecl =
  | VarDeclStmt
  | FuncStmt
  | ClassDeclStmt
  | LJSExternFunctionStmt
  | ImportStmt
  | ImportStarAsStmt

export class SymbolTable {
  private values = new Map<string, ValueDecl>()
  private duplicate_values = new Map<string, ValueDecl[]>()

  add_value(name: string, decl: ValueDecl): void {
    if (this.values.has(name)) {
      const existing = this.values.get(name)
      assert(existing, `Expected existing value for ${name} to be defined`)
      if (!this.duplicate_values.has(name)) {
        this.duplicate_values.set(name, [existing])
      }
      this.duplicate_values.get(name)?.push(decl)
      return
    }
    this.values.set(name, decl)
  }

  get_value(name: string): ValueDecl | undefined {
    return this.values.get(name)
  }
}
