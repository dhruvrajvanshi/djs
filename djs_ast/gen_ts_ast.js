/// <reference path="./index.d.ts" />
import { ast_items } from "./src/ast.def.js"

let output = ''
for (const item of ast_items) {
  if (item.kind === "struct") {
    output += gen_struct(item);
  } else {
    output += gen_enum(item);
  }
}
console.log(output);


/**
  * @param {StructItem} item
  */
function gen_struct(item) {
  const span = item.tags.includes("span")
    ? `readonly span: Span`
    : ``;
  return `
    interface ${item.name} {
      ${span}
      ${item.fields.map(([name, ty]) => `readonly ${name}: ${gen_type(ty)};`).join("\n")}
    }
  `
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
    return ty
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
      case "Box":
        return gen_type(arg);
    }
  }
}

/**
  * @param {EnumItem} item
  * @returns {string}
  */
function gen_enum(item) {
  if (item.variants.some(v => v.args.length > 0)) {
    const variants = item.variants.map(gen_variant).join(" | ");
    return `type ${item.name} = ${variants};`
  } else {
    const variants = item.variants.map(v => v.name).map(JSON.stringify).join(" | ");
    return `type ${item.name} = ${variants};`
  }


  /**
    * @param {EnumVariant} variant
    * @returns {string}
    */
  function gen_variant(variant) {
      return `{
        readonly kind: "${variant.name}",
        readonly args: [${variant.args.map(gen_type).join(", ")}]
      }`
  }
}
