import {
  ast_items,
  items_by_name,
  needs_lifetime_param,
} from "./src/ast.js";

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
      if (inherits_span(variant)) {
        return `Self::${variant.name}(inner) => inner.span()`;
      } else {
        return `Self::${variant.name}(span, ..) => *span`;
      }
    }
  }
  if (methods.length > 0) {
    methods = `
      impl ${lifetime_param} ${item.name}${lifetime_param} {
        ${methods}
      }
    `;
  }
  const derives = ["Debug"];
  if (item.tags.includes("clone")) {
    derives.push("Clone");
  }
  return `
    #[derive(${derives.join(", ")})]
    pub enum ${item.name}${lifetime_param} {
        ${variants}
    }
    ${methods}
  `;

  /**
   *
   * @param {EnumVariant} variant
   */
  function inherits_span(variant) {
    return (
      variant.args.length === 1 &&
      !variant.tags.includes("span") &&
      type_is_spanned(variant.args[0])
    );
  }

  /**
   * @param {EnumVariant} variant
   * @returns
   */
  function gen_variant(variant) {
    /** @type {string[]} */
    const args = [];
    if (item.tags.includes("span") && !inherits_span(variant)) {
      args.push("Span");
    }
    args.push(...variant.args.map(gen_type));
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
  const derives = ["Debug"];
  if (item.tags.includes("clone")) {
    derives.push("Clone");
  }

  return `
    #[derive(${derives.join(", ")})]
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

/**
 *
 * @param {Type} type
 * @returns {boolean}
 */
function type_is_spanned(type) {
  if (typeof type === "string") {
    return items_by_name[type]?.tags.includes("span") ?? false;
  } else {
    if (type.length > 2) {
      throw new Error("Unexpected type: " + JSON.stringify(type));
    }
    const [container, arg] = type;
    return container === "Box" && type_is_spanned(arg);
  }
}
