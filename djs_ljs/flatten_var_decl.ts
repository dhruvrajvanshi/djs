import type { DeclType, Expr, TypeAnnotation, VarDeclStmt } from "djs_ast"
import { todo } from "djs_std"

export interface FlatVarDecl {
  name: string
  decl_type: DeclType
  type_annotation: TypeAnnotation | null
  init: Expr | null
}

/**
 * Converts var decls with patterns into a simplified sequence of statements
 * of the form
 * let x: Type? = init?
 *
 * @example
 * let {foo, bar}: T1 = baz, bat;
 * // becomes
 * let s_temp: T1 = baz;
 * let foo = s_temp.foo;
 * let bar = s_temp.bar;
 * let bat = baz.bat;
 */
export function flatten_var_decl(stmt: VarDeclStmt): FlatVarDecl[] {
  const result: FlatVarDecl[] = []
  for (const declarator of stmt.decl.declarators) {
    switch (declarator.pattern.kind) {
      case "Var": {
        result.push({
          decl_type: stmt.decl.decl_type,
          name: declarator.pattern.ident.text,
          init: declarator.init,
          type_annotation: declarator.type_annotation,
        })
        break
      }
      default:
        return todo(declarator.pattern.kind)
    }
  }
  return result
}
