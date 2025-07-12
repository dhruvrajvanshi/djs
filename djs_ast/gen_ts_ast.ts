import { ast_items } from "./ast.def.ts"
import type { EnumItem, EnumVariant, StructItem, Type } from "./astgen_items.js"

let output = `
// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.ts";
import type { Diagnostic } from "./Diagnostic.ts";
import { expr_to_sexpr, stmt_to_sexpr, type_annotation_to_sexpr, pattern_to_sexpr, sexpr_to_string } from "./sexpr.ts";

/**
 * Raw source text
 */
type Text = string;
`
for (const item of ast_items) {
  if (item.kind === "struct") {
    output += gen_struct(item) + "\n"
  } else {
    output += gen_enum(item)
  }
}
console.log(output)

function gen_struct(item: StructItem) {
  const span = item.tags.includes("span") ? `readonly span: Span` : ``
  const leading_trivia = item.tags.includes("trivia")
    ? `readonly leading_trivia: string`
    : ``
  return `
    export interface ${item.name} {
      ${leading_trivia}
      ${span}
      ${Object.entries(item.fields)
        .map(([name, field]) => `readonly ${name}: ${gen_type(field.type)};`)
        .join("\n")}
    }
  `
}

function gen_type(ty: Type): string {
  if (typeof ty === "string") {
    if (ty === "str") {
      return "string"
    }
    return ty
  } else {
    if (ty.length !== 2) {
      throw new Error(`Invalid type: ${ty}`)
    }
    const [kind, arg] = ty
    switch (kind) {
      case "Vec":
        return `readonly ${gen_type(arg)}[]`
      case "Option":
        return `${gen_type(arg)} | null`
    }
  }
}

function gen_enum_factories(item: EnumItem): string {
  if (item.variants.some((v) => Object.entries(v.args).length > 0)) {
    const variants = item.variants.map(gen_variant)
    return `
    export const ${item.name} = {
      ${variants.join(",\n\n")}
    } as const`
  } else {
    const variants = item.variants
      .map((v) => `${v.name}: ${JSON.stringify(v.name)}`)
      .join(",\n")
    return `export const ${item.name} = {
      ${variants}
    } as const`
  }

  function gen_variant(variant: EnumVariant): string {
    if (Object.entries(variant.args).length > 0 || item.tags.includes("span")) {
      const variantType = `${variant.name}${item.name}`
      const params = Object.entries(variant.args)
        .map(([name, type]) => `${escape_js_name(name)}: ${gen_type(type)}`)
        .join(", ")
      const param_names = Object.keys(variant.args)
        .map((name) => escape_js_name(name))
        .join(", ")
      const span_param = item.tags.includes("span") ? `span: Span, ` : ``
      const span = item.tags.includes("span") ? `span, ` : ``
      const leading_trivia_param = item.tags.includes("trivia")
        ? `leading_trivia: string, `
        : ``
      const leading_trivia = item.tags.includes("trivia")
        ? `leading_trivia, `
        : ``
      return (
        `${variant.name}: (${span_param}${leading_trivia_param}${params}): ${variantType} => ` +
        `new ${variant.name}${item.name}(${span} ${leading_trivia} ${param_names})`
      )
    } else {
      return `${variant.name}: new ${variant.name}${item.name}()`
    }
  }
}

function escape_js_name(name: string): string {
  if (name === "class") {
    return "klass"
  }
  return name
}

function gen_enum(item: EnumItem): string {
  let result: string = ""
  result += gen_type_decl(item) + "\n"
  result += gen_enum_factories(item) + "\n"
  return result

  function gen_type_decl(item: EnumItem): string {
    if (item.variants.some((v) => Object.entries(v.args).length > 0)) {
      const variant_classes = item.variants.map(gen_variant_class).join("\n")
      return `
        export type ${item.name} = ${item.variants.map((it) => `${it.name}${item.name}`).join(" | ")};
        ${variant_classes}
      `
    } else {
      const variants = item.variants
        .map((v) => v.name)
        .map((name) => JSON.stringify(name))
        .join(" | ")
      return `export type ${item.name} = ${variants};`
    }
  }

  function gen_variant_class(variant: EnumVariant): string {
    const span_param = item.tags.includes("span") ? `readonly span: Span, ` : ``
    const leading_trivia_param = item.tags.includes("trivia")
      ? `readonly leading_trivia: string, `
      : ``
    let toString = ""
    if (item.name === "Stmt") {
      toString = `toString(): string { return sexpr_to_string(stmt_to_sexpr(this)) }`
    } else if (item.name === "Expr") {
      toString = `toString(): string { return sexpr_to_string(expr_to_sexpr(this)) }`
    } else if (item.name === "TypeAnnotation") {
      toString = `toString(): string { return sexpr_to_string(type_annotation_to_sexpr(this)) }`
    } else if (item.name === "Pattern") {
      toString = `toString(): string { return sexpr_to_string(pattern_to_sexpr(this)) }`
    } else if (item.name === "Func") {
      toString = `toString(): string { return sexpr_to_string(func_to_sexpr(this)) }`
    }

    return `export class ${variant.name}${item.name} {
        constructor(
          ${span_param}
          ${leading_trivia_param}
          ${Object.entries(variant.args)
            .map(
              ([name, type]) =>
                "readonly " + escape_js_name(name) + ": " + gen_type(type),
            )
            .join(", ")}
        ) {}

        get kind(): "${variant.name}" { return "${variant.name}" }

        ${toString}
      }`
  }
}
