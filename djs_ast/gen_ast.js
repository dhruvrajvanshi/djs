const { ast_items } = require("./src/ast.js");

const items_by_name = Object.fromEntries(
  ast_items.map((item) => [item.name, item])
);

const needs_lifetime_param = needs_lifetime_param_set();

let result = `
// This file is generated automatically
// node djs_ast/gen_ast.js | rustfmt
// DO NOT EDIT
use djs_syntax::Span;

`;
for (const item of ast_items) {
  result += gen_item(item) + "\n\n";
}
console.log(result);

/**
 * @param {Item} item
 * @returns {string}
 */
function gen_item(item) {
  switch (item.kind) {
    case "struct":
      return gen_struct(item);
    case "enum":
      return gen_enum(item);
  }
}

/**
 *
 * @param {EnumItem} item
 * @returns {string}
 */
function gen_enum(item) {
  let lifetime_param = "";
  if (needs_lifetime_param.has(item.name)) {
    lifetime_param = "<'a>";
  }
  const variants = item.variants.map(gen_variant).join(",\n");
  let methods = "";
  if (item.tags.includes("span")) {
    methods += `
      pub fn span(&self) -> Span {
        match self {
          ${item.variants.map(gen_case).join(",\n")}
        }
      }
    `;
    /**
     *
     * @param {EnumVariant} variant
     * @returns {string}
     */
    function gen_case(variant) {
      return `Self::${variant.name}(span, ..) => *span`
    }
  }
  if (methods.length > 0) {
    methods = `
      impl ${lifetime_param} ${item.name}${lifetime_param} {
        ${methods}
      }
    `;
  }
  return `
    #[derive(Debug)]
    pub enum ${item.name}${lifetime_param} {
        ${variants}
    }
    ${methods}
  `;

  /**
   * @param {EnumVariant} variant
   * @returns
   */
  function gen_variant(variant) {
    /** @type {string[]} */
    const args = [];

    if (item.tags.includes("span")) {
      args.push("Span");
    }
    if (typeof variant !== "string") {
      args.push(...variant.args.map(gen_type));
    }
    if (args.length > 0) {
      return `  ${variant.name}(${args.join(", ")})`;
    } else {
      return `  ${variant.name}`;
    }
  }
}

/**
 * @param {StructItem} item
 * @returns {string}
 */
function gen_struct(item) {
  let lifetime_param = "";
  if (needs_lifetime_param.has(item.name)) {
    lifetime_param = "<'a>";
  }
  const fields = item.fields
    .map(([name, type]) => {
      return `  pub ${name}: ${gen_type(type)}`;
    })
    .join(",\n");
  let span = "";
  if (item.tags.includes("span")) {
    span = "pub span: Span,";
  }
  let methods = "";

  if (item.tags.includes("span")) {
    methods += `
      pub fn span(&self) -> Span {
        self.span
      }
    `;
  }
  if (methods.length > 0) {
    methods = `
      impl ${lifetime_param} ${item.name}${lifetime_param} {
        ${methods}
      }
    `;
  }

  return `
    #[derive(Debug)]
    pub struct ${item.name}${lifetime_param} {
      ${span}
      ${fields}
    }
    ${methods}
  `;
}

/**
 * @param {Type} type
 * @returns {string}
 */
function gen_type(type) {
  if (typeof type === "string") {
    switch (type) {
      case "str":
        return "&'a str";
      default:
        if (needs_lifetime_param.has(type)) {
          return `${type}<${"'a"}>`;
        }
        return type;
    }
  } else {
    return `${type[0]}<${type.slice(1).map(gen_type).join(", ")}>`;
  }
}

function needs_lifetime_param_set() {
  const result = new Set();

  for (const item of ast_items) {
    if (item_contains_ident_or_text(item)) {
      result.add(item.name);
    }
  }

  return result;

  /**
   * @param {Item} item
   * @returns {boolean}
   **/
  function item_contains_ident_or_text(item) {
    if (result.has(item.name)) {
      return true;
    }
    switch (item.kind) {
      case "struct":
        return item.fields.some(([_, type]) =>
          type_contains_ident_or_text(type)
        );
      case "enum":
        return item.variants.some((variant) =>
          variant.args.length > 0 && variant.args.some(type_contains_ident_or_text)
        );
    }
  }

  /**
   * @param {Type} type
   * @returns {boolean}
   */
  function type_contains_ident_or_text(type) {
    if (typeof type === "string") {
      if (type === "str") {
        return true;
      }
      if (items_by_name[type] === undefined) {
        throw new Error(`Unknown type: ${type}`);
      }
      return item_contains_ident_or_text(items_by_name[type]);
    } else {
      return type.slice(1).some(type_contains_ident_or_text);
    }
  }
}
