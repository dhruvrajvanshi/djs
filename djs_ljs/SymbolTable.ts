import {
  ImportStarAsStmt,
  LJSExternConstStmt,
  LJSExternTypeStmt,
  StructDeclStmt,
  type ClassDeclStmt,
  type Func,
  type ImportStmt,
  type LJSExternFunctionStmt,
  type TypeAliasStmt,
  type VarDecl,
} from "djs_ast"
import { MapUtils } from "djs_std"
import assert from "node:assert"
import { Type } from "./type.ts"

export type ValueDeclOfKind<K extends ValueDecl["kind"]> = Extract<
  ValueDecl,
  { kind: K }
>
export type ValueDeclExcludingKind<K extends ValueDecl["kind"]> = Exclude<
  ValueDecl,
  { kind: K }
>
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
  | {
      kind: "LJSBuiltin"
      name: "linkc"
    }
  | {
      kind: "Import"
      stmt: ImportStmt
      /**
       * The the absolute path to which this import points to.
       * i.e.
       * import { foo } from "./foo.djs",
       * this will be the absolute version of "./foo.djs"
       * So, if the import is in a file at /some/path/x.djs,
       * the imported_file will be /some/path/foo.djs
       */
      imported_file: string
    }
  | {
      kind: "ImportStarAs"
      stmt: ImportStarAsStmt
      /**
       * The the absolute path to which this import points to.
       * i.e.
       * import * as foo from "./foo.djs",
       *  this will be the absolute version of "./foo.djs"
       *  So, if the import is in a file at /some/path/x.djs,
       *  the imported_file will be /some/path/foo.djs
       */
      imported_file: string
    }
  | {
      /**
       * The binding of the variable foo brought into scope by something like this
       * import * as foo from "./foo.djs"
       *
       * All idents bound to this foo will have this declaration.
       * This declaration is produced after resolving all imports.
       * This simplifies the typechecking phase where we don't have to deal
       * with imports. We can simply ask for the binding of any variable and compute
       * the type from there.
       */
      kind: "Module"
      path: string
      values: Map<string, ValueDeclExcludingKind<"Import" | "ImportStarAs">>
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

export type TypeDeclOfKind<K extends TypeDecl["kind"]> = Extract<
  TypeDecl,
  { kind: K }
>
export type TypeDeclExcludingKind<K extends TypeDecl["kind"]> = Exclude<
  TypeDecl,
  { kind: K }
>

export type TypeDecl =
  | {
      kind: "TypeAlias"
      stmt: TypeAliasStmt
      source_file: string
    }
  | {
      kind: "Import"
      stmt: ImportStmt
      /**
       * The the absolute path to which this import points to.
       * i.e.
       * import { foo } from "./foo.djs",
       * this will be the absolute version of "./foo.djs"
       * So, if the import is in a file at /some/path/x.djs,
       * the imported_file will be /some/path/foo.djs
       */
      imported_file: string
    }
  | {
      kind: "ImportStarAs"
      stmt: ImportStarAsStmt
      /**
       * The the absolute path to which this import points to.
       * i.e.
       * import * as foo from "./foo.djs",
       *  this will be the absolute version of "./foo.djs"
       *  So, if the import is in a file at /some/path/x.djs,
       *  the imported_file will be /some/path/foo.djs
       */
      imported_file: string
    }
  | { kind: "Builtin"; type: Type }
  | {
      kind: "Struct"
      decl: StructDeclStmt
      source_file: string
    }
  | {
      kind: "ExternType"
      stmt: LJSExternTypeStmt
      source_file: string
    }
  /**
   * Introduced after resolving imports
   * See the comment in ValueDecl for more details.
   */
  | {
      kind: "Module"
      path: string
      types: Map<string, TypeDeclExcludingKind<"Import" | "ImportStarAs">>
    }
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

  value_entries(): IterableIterator<[string, ValueDecl]> {
    return this.values.entries()
  }
  type_entries(): IterableIterator<[string, TypeDecl]> {
    return this.types.entries()
  }
}
