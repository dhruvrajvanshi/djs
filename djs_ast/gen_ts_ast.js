/// <reference path="./index.d.ts" />
import { ast_items } from "./src/ast.def.js";

let output = `
// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.js";
`;
for (const item of ast_items) {
  if (item.kind === "struct") {
    output += gen_struct(item) + "\n";
  } else {
    output += gen_enum(item) + "\n";
  }
}
console.log(output);

/**
 * @param {StructItem} item
 */
function gen_struct(item) {
  const span = item.tags.includes("span") ? `readonly span: Span` : ``;
  return `
    export interface ${item.name} {
      ${span}
      ${Object.entries(item.fields).map(([name, ty]) => `readonly ${name}: ${gen_type(ty)};`).join("\n")}
    }
  `;
}

/**
 * @param {Type} ty
 * @returns {string}
 */
function gen_type(ty) {
  if (typeof ty === "string") {
    if (ty === "str") {
      return "string";
    }
    return ty;
  } else {
    if (ty.length !== 2) {
      throw new Error(`Invalid type: ${ty}`);
    }
    const [kind, arg] = ty;
    switch (kind) {
      case "Vec":
        return `readonly ${gen_type(arg)}[]`;
      case "Option":
        return `${gen_type(arg)} | null`;
    }
  }
}

/**
 * @param {EnumItem} item
 * @returns {string}
 */
function gen_enum(item) {
  if (item.variants.some((v) => Object.entries(v.args).length > 0)) {
    const variants = item.variants.map(gen_variant).join(" | ");
    return `export type ${item.name} = ${variants};`;
  } else {
    const variants = item.variants
      .map((v) => v.name)
      .map((name) => JSON.stringify(name))
      .join(" | ");
    return `export type ${item.name} = ${variants};`;
  }

  /**
   * @param {EnumVariant} variant
   * @returns {string}
   */
  function gen_variant(variant) {
    const span = item.tags.includes("span") ? `readonly span: Span;` : ``;
    return `{
        readonly kind: "${variant.name}"; ${span}
        ${Object.entries(variant.args)
          .map(([name, type]) => "readonly " + name + ": " + gen_type(type))
          .join(", ")}
      }`;
  }
}
