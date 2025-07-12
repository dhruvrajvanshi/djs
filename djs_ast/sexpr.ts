import { type_registry } from "./ast.def.ts"
import type {
  Expr,
  SourceFile,
  Stmt,
  TypeAnnotation,
  Func,
  Pattern,
} from "./ast.gen.ts"
import type { EnumItem, StructItem, Type } from "./astgen_items.ts"
import {
  DStmt as StmtDef,
  DExpr as ExprDef,
  DTypeAnnotation as TypeAnnotationDef,
  DSourceFile as SourceFileDef,
  DFunc as FuncDef,
  DPattern as PatternDef,
} from "./ast.def.ts"
import assert from "node:assert/strict"
import { is_readonly_array } from "djs_std"

export type SExpr =
  | string
  | null
  | boolean
  | number
  | readonly SExpr[]
  | { readonly [key: string]: SExpr }

export function sexpr_to_string(sexpr: SExpr): string {
  switch (typeof sexpr) {
    case "string":
    case "number":
    case "boolean":
      return String(sexpr)
    case "object": {
      if (sexpr === null) return "null"
      else if (is_readonly_array(sexpr)) {
        return "(" + sexpr.map(sexpr_to_string).join(" ") + ")"
      } else {
        return "{" + Object.entries(sexpr).map(sexpr_to_string).join(", ") + "}"
      }
    }
  }
}

const stmt_dumper = variant_dumper<Stmt>(StmtDef)
export function stmt_to_sexpr(stmt: Stmt): SExpr {
  return stmt_dumper(stmt)
}
const expr_dumper = variant_dumper<Expr>(ExprDef)
export function expr_to_sexpr(expr: Expr): SExpr {
  return expr_dumper(expr)
}
const annotation_dumper = variant_dumper<TypeAnnotation>(TypeAnnotationDef)
export function type_annotation_to_sexpr(type: TypeAnnotation): SExpr {
  return annotation_dumper(type)
}

export const pattern_dumper = variant_dumper(PatternDef)
export function pattern_to_sexpr(pattern: Pattern): SExpr {
  return pattern_dumper(pattern)
}

export const source_file_dumper = struct_dumper(SourceFileDef)
export function source_file_to_sexpr(source_file: SourceFile): SExpr {
  return source_file_dumper(source_file)
}
const func_dumper = struct_dumper(FuncDef)
export function func_to_sexpr(func: Func): SExpr {
  return func_dumper(func)
}

function variant_dumper<T>(item: EnumItem): (value: T) => SExpr {
  if (item.variants.some((v) => Object.entries(v.args).length > 0)) {
    return (value: unknown) => {
      assert(
        typeof value === "object" && value !== null,
        `Expected object, got ${JSON.stringify(value)}`,
      )
      assert("kind" in value)
      const kind = value["kind"]
      assert(
        typeof kind === "string",
        `Expected kind to be a string, got ${kind}`,
      )
      const variant = item.variants.find((v) => v.name === kind)
      assert(variant, `Unknown variant: ${kind} in ${item.name}`)
      const entries: Record<string, SExpr> = {}
      for (const [name, type] of Object.entries(variant.args)) {
        const dumper = type_to_dumper(type)
        assert(name in value, `Missing field: ${name} in ${item.name}.${kind}`)
        const field = (value as Record<string, unknown>)[name]
        entries[name] = dumper(field)
      }
      return { kind: variant.name, ...entries }
    }
  } else {
    return (value: unknown) => {
      assert(typeof value === "string")
      return `${item.name}.${value}`
    }
  }
}
function object_dumper(item: EnumItem | StructItem): (value: unknown) => SExpr {
  if (item.kind === "enum") {
    return variant_dumper(item)
  } else {
    return struct_dumper(item)
  }
}
function struct_dumper(item: StructItem): (value: unknown) => SExpr {
  return (value: unknown) => {
    assert(
      typeof value === "object" && value !== null,
      `Expected object, got ${JSON.stringify(value)}`,
    )
    const fields: Record<string, SExpr> = {
      kind: item.name,
    }
    for (const [name, field] of Object.entries(item.fields)) {
      if (field.tags.includes("sexpr_ignore")) continue

      const dumper = type_to_dumper(field.type)
      assert(name in value, `Missing field: ${name} in ${item.name}`)
      fields[name] = dumper((value as Record<string, unknown>)[name])
    }
    return fields
  }
}

function type_to_dumper(type: Type): (value: unknown) => SExpr {
  if (typeof type === "string") {
    switch (type) {
      case "Text":
        return (value: unknown) => {
          assert(typeof value === "string")
          return value
        }
      case "Ident":
        return (value: unknown) => {
          assert(value !== null)
          assert(typeof value === "object")
          assert("text" in value, JSON.stringify(value))
          assert(typeof value.text === "string", JSON.stringify(value))
          return value.text
        }
      case "boolean":
        return primitive_dumper
      case "str":
        return (value) => {
          assert(typeof value === "string")
          return value
        }
      default: {
        const registered_item = type_registry[type]
        if (registered_item) {
          return object_dumper(registered_item)
        }
        return (value: unknown) => {
          throw new assert.AssertionError({
            message: `got ${JSON.stringify(value, null, 2)}; Unknown type: ${type}; `,
          })
        }
      }
    }
  } else {
    assert(type.length === 2, `Invalid type: ${JSON.stringify(type)}`)
    const [kind, arg] = type
    switch (kind) {
      case "Vec":
        return (value: unknown) => {
          if (!isROArray(value)) {
            throw new Error(`Expected Vec, got ${JSON.stringify(value)}`)
          }
          return value.map(type_to_dumper(arg))
        }
      case "Option":
        return (value: unknown) => {
          if (value === null) {
            return null
          }
          return type_to_dumper(arg)(value)
        }
    }
  }
}
function primitive_dumper(value: unknown): SExpr {
  assert(
    typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "number",
  )
  return value
}
function isROArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
