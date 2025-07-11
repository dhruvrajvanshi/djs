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
import { Type } from "./type.js"

export type ValueDecl =
  | VarDeclStmt
  | FuncStmt
  | ClassDeclStmt
  | LJSExternFunctionStmt
  | { kind: "Import"; stmt: ImportStmt; from_path: string }
  | { kind: "ImportStarAs"; stmt: ImportStarAsStmt; from_path: string }

export type TypeDecl =
  | TypeAliasStmt
  | { kind: "Import"; stmt: ImportStmt; from_path: string }
  | { kind: "Builtin"; type: Type }

export class SymbolTable {
  private values = new Map<string, ValueDecl>()
  private types = new Map<string, TypeDecl>()
  private duplicate_values = new Map<string, ValueDecl[]>()
  private duplicate_types = new Map<string, TypeDecl[]>()
  static readonly Global = new SymbolTable()
  static {
    const ty = (name: string, type: Type) =>
      SymbolTable.Global.add_type(name, { kind: "Builtin", type })
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
  }

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
