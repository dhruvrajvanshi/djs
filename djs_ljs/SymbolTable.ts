import type {
  ClassDeclStmt,
  Func,
  ImportStarAsStmt,
  ImportStmt,
  LJSExternFunctionStmt,
  SourceFile,
  TypeAliasStmt,
  VarDeclStmt,
} from "djs_ast"
import { MapUtils } from "djs_std"
import assert from "node:assert"
import { Type } from "./type.js"

export type ValueDecl =
  | VarDeclStmt
  | { kind: "Func"; func: Func }
  | { kind: "Param"; func: Func; param_index: number }
  | ClassDeclStmt
  | LJSExternFunctionStmt
  | {
      kind: "Import"
      stmt: ImportStmt
      /**
       * The file in which this import statement is declared.
       */
      imported_from: SourceFile
    }
  | {
      kind: "ImportStarAs"
      stmt: ImportStarAsStmt
      /**
       * The file in which this import statement is declared.
       */
      imported_from: SourceFile
    }
export type VarStmtValueDecl = Extract<ValueDecl, { kind: "VarDecl" }>
export type FuncValueDecl = Extract<ValueDecl, { kind: "Func" }>
export type ClassValueDecl = Extract<ValueDecl, { kind: "ClassDecl" }>
export type LJSExternFunctionValueDecl = Extract<
  ValueDecl,
  { kind: "LJSExternFunction" }
>
export type ImportValueDecl = Extract<ValueDecl, { kind: "Import" }>
export type ImportStarAsValueDecl = Extract<ValueDecl, { kind: "ImportStarAs" }>

export type TypeDecl =
  | TypeAliasStmt
  | {
      kind: "Import"
      stmt: ImportStmt
      /**
       * The file in which this import statement is declared.
       */
      imported_from: SourceFile
    }
  | { kind: "Builtin"; type: Type }
export type ImportTypeDecl = Extract<TypeDecl, { kind: "Import" }>
export type TypeAliasTypeDecl = Extract<TypeDecl, { kind: "TypeAlias" }>
export type BuiltinTypeDecl = Extract<TypeDecl, { kind: "Builtin" }>

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
