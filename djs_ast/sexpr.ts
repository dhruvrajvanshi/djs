import { type_registry } from "./ast.def.js"
import type { SourceFile, Stmt } from "./ast.gen.js"
import type { EnumItem, StructItem, Type } from "./astgen_items.js"
import { DStmt as StmtDef } from "./ast.def.js"
import assert from "node:assert/strict"

type SExpr = string | null | boolean | number | SExpr[] | SObject
interface SObject {
  [key: string]: SExpr
}
function makeSObject(name: string, fields: Record<string, SExpr>): SObject {
  const cls = class {
    constructor(fields: Record<string, SExpr>) {
      Object.assign(this, fields)
    }
  }
  Object.defineProperty(cls, "name", {
    value: name,
  })
  return new cls(fields) as never
}

function stmt_to_sexpr(stmt: Stmt): SExpr {
  return variant_dumper<Stmt>(StmtDef)(stmt)
}
export function source_file_to_sexpr(source_file: SourceFile): SExpr {
  return ["SourceFile", ...source_file.stmts.map(stmt_to_sexpr)]
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
      const variant = item.variants.find((v) => v.name === kind)
      assert(variant, `Unknown variant: ${kind} in ${item.name}`)
      const entries: Record<string, SExpr> = {}
      for (const [name, type] of Object.entries(variant.args)) {
        const dumper = type_to_dumper(type)
        assert(name in value, `Missing field: ${name} in ${item.name}.${kind}`)
        const field = (value as Record<string, unknown>)[name]
        entries[name] = dumper(field)
      }
      return makeSObject(`${item.name}.${kind}`, entries)
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
    const fields: Record<string, SExpr> = {}
    for (const [name, type] of Object.entries(item.fields)) {
      const dumper = type_to_dumper(type)
      assert(name in value, `Missing field: ${name} in ${item.name}`)
      fields[name] = dumper((value as Record<string, unknown>)[name])
    }
    return makeSObject(item.name, fields)
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
