import type {
  ClassDeclStmt,
  FuncStmt,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  TypeAliasStmt,
  VarDeclStmt,
} from "djs_ast"
import { MapUtils } from "djs_std"
import assert from "node:assert"

export type ValueDecl =
  | VarDeclStmt
  | FuncStmt
  | ClassDeclStmt
  | LJSExternFunctionStmt
  | ImportStmt
  | ImportStarAsStmt

export type TypeDecl = TypeAliasStmt | ImportStmt
export class SymbolTable {
  private values = new Map<string, ValueDecl>()
  private types = new Map<string, TypeDecl>()
  private duplicate_values = new Map<string, ValueDecl[]>()
  private duplicate_types = new Map<string, TypeDecl[]>()

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

  add_type(name: string, decl: TypeDecl): void {
    const existing = this.types.get(name)
    if (existing) {
      MapUtils.get_or_set(this.duplicate_types, name, []).push(decl)
    } else {
      this.types.set(name, decl)
    }
  }
  get_type(name: string): TypeDecl | undefined {
    return this.types.get(name)
  }
}
