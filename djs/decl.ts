import type { Func, TypeAliasStmt, VarDecl } from "djs_ast"
import type { Type } from "./type.ts"

export type ValueDecl =
  | {
      kind: "VarDecl"
      decl: VarDecl
      name: string
      source_file: string
    }
  | { kind: "Func"; func: Func; source_file: string }
  | { kind: "Param"; func: Func; param_index: number; source_file: string }
  | ModuleDecl

export interface ModuleDecl {
  kind: "Module"
  values: ReadonlyMap<string, ValueDecl>
  types: ReadonlyMap<string, TypeDecl>
  /**
   * Useful for issuing diagnositics when you try to refer
   * to a symbol which isn't exported
   */
  private_values: ReadonlyMap<string, ValueDecl>
  private_types: ReadonlyMap<string, TypeDecl>
}

export type TypeDecl =
  | {
      kind: "TypeAlias"
      stmt: TypeAliasStmt
      source_file: string
    }
  | {
      kind: "Builtin"
      type: Type
    }
  /**
   * Introduced after resolving imports
   * See the comment in ValueDecl for more details.
   */
  | ModuleDecl
