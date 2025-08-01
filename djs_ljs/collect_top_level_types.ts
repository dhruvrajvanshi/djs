import type { SourceFiles } from "./SourceFiles.ts"
import type { FS } from "./FS.ts"
import { build_source_file_symbol_table } from "./build_symbol_table.ts"
import { PathMap } from "./PathMap.ts"
import { Type } from "./type.js"
import { assert_never, assert_todo, todo } from "djs_std"
import type { FuncStmt, SourceFile, TypeAnnotation, VarDeclStmt } from "djs_ast"
import assert from "node:assert"

import {
  SymbolTable,
  type ImportTypeDecl,
  type TypeDecl,
} from "./SymbolTable.js"

export function collect_top_level_types(source_files: SourceFiles, fs: FS) {
  const symbol_tables = source_files.map_values(build_source_file_symbol_table)
  const result = new PathMap<Map<string, Type>>(fs)

  for (const source_file of source_files.values()) {
    for (const stmt of source_file.stmts) {
      switch (stmt.kind) {
        case "VarDecl":
          visit_var_decl(source_file, stmt)
          break
        case "Func":
          visit_func_stmt(source_file, stmt)
          break
        case "Import":
          break
        case "TypeAlias":
          break

        default:
          todo(stmt.kind)
      }
    }
  }
  return result
  function visit_var_decl(source_file: SourceFile, stmt: VarDeclStmt) {
    assert_todo(stmt.decl.declarators.length === 1)
    const declarator = stmt.decl.declarators[0]
    assert_todo(declarator.pattern.kind === "Var")
    assert_todo(declarator.type_annotation)
    const type = annotation_to_type(() => todo(), declarator.type_annotation)

    result
      .get_or_put(source_file.path, () => new Map())
      .set(declarator.pattern.ident.text, type)
  }
  function visit_func_stmt(source_file: SourceFile, { func }: FuncStmt) {
    const symbol_table = symbol_tables.get(source_file.path)
    assert(symbol_table)
    assert_todo(func.name)
    const resolve_type_from_decl = (
      name: string,
      decl: TypeDecl,
      decl_source_file: SourceFile,
    ): Type => {
      switch (decl.kind) {
        case "Import":
          return resolve_type_import(name, decl)
        case "TypeAlias": {
          const source_file_symbol_table = symbol_tables.get(
            decl_source_file.path,
          )
          assert(source_file_symbol_table)
          const resolve = (name: string) =>
            resolve_type(source_file_symbol_table, name)
          return annotation_to_type(resolve, decl.type_annotation)
        }
        case "Module":
        case "ImportStarAs":
        case "Builtin":
          todo()
        default:
          assert_never(decl)
      }
    }
    const resolve_type = (symbol_table: SymbolTable, name: string): Type => {
      const decl = symbol_table.get_type(name)
      assert_todo(
        decl,
        `Unresolved type "${name}" in the top level scope of ${source_file.path}`,
      )
      return resolve_type_from_decl(name, decl, source_file)
    }
    const resolve_type_import = (
      name: string,
      { imported_file }: ImportTypeDecl,
    ): Type => {
      const imported_from_file = source_files.get(imported_file)
      assert_todo(imported_from_file)
      const imported_from_symbol_table = symbol_tables.get(imported_file)
      assert(imported_from_symbol_table)
      const decl = imported_from_symbol_table.get_type(name)
      assert_todo(decl)
      return resolve_type_from_decl(name, decl, imported_from_file)
    }
    const resolve = (name: string) => resolve_type(symbol_table, name)
    const param_types = func.params.map((p) => {
      assert_todo(p.type_annotation)
      return annotation_to_type(resolve, p.type_annotation)
    })
    const return_type = func.return_type
      ? annotation_to_type(resolve, func.return_type)
      : Type.Error("Top level functions must have a return type annotation")

    const ty = Type.UnboxedFunc(param_types, return_type)
    result.get_or_put(source_file.path, () => new Map()).set(func.name.text, ty)
  }
}

function annotation_to_type(
  env: (name: string) => Type,
  annotation: TypeAnnotation,
): Type {
  switch (annotation.kind) {
    case "Ident":
      switch (annotation.ident.text) {
        case "u32":
          return Type.u32
        default:
          return env(annotation.ident.text)
      }
    default:
      return todo(annotation.kind)
  }
}
