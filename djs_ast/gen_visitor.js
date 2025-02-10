const { ast_items, items_by_name } = require("./src/ast.js");

console.log("use crate::ast::*;");
console.log("pub trait Visitor<'s>: Sized {");
for (const item of ast_items) {
  if (item.tags.includes("visit")) {
    console.log(
      `fn visit_${to_camel_case(item.name)}(&self, node: &${item.name}<'s>) -> () {
	walk_${to_camel_case(item.name)}(self, node);
      }`,
    );
  }
}
console.log("}");

for (const item of ast_items) {
  if (type_is_visit(item.name)) {
    console.log(
      `pub fn walk_${to_camel_case(item.name)}<'s, V: Visitor<'s>>(visitor: &V, node: &${item.name}<'s>) -> () {`,
    );

    if (item.kind === "struct") console.log(visit_struct(item, "node"));
    else if (item.kind === "enum") console.log(visit_enum(item, "node"));

    console.log("}");
  }
}

/**
 * @param {EnumItem} item
 * @param {string} name
 * @returns {string}
 */
function visit_enum(item, name) {
  let result = `match ${name} {`;
  for (const field of item.variants) {
    const params = [];
    if (item.tags.includes("span") && !inherits_span(field)) {
      params.push("_span");
    }
    const other_params = field.args.map((_, index) => `_${index}`);
    params.push(...other_params);
    const fields = field.args
      .map((arg, index) => {
        const name = "_" + index;
        return visit_ty(arg, name);
      })
      .join(";\n");
    const param_str = params.length === 0 ? "" : "(" + params.join(", ") + ")";
    result += `
	  ${item.name}::${field.name}${param_str} => {
	    ${fields}
	  }
    `.trim();
  }

  result += "}";
  return result;
}

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
 * @param {Type} type
 * @param {string} name
 * @returns {string}
 */
function visit_ty(type, name) {
  console.error(`visit_ty(${gen_ty(type)}, ${name})`);
  if (type_is_visit(type)) {
    let ty_name = typeof type === "string" ? type : type[1].toString();
    console.error(`visitor.visit_${to_camel_case(ty_name)}(&${name});`);
    return `visitor.visit_${to_camel_case(ty_name)}(&${name});`;
  }
  if (typeof type === "string") {
    if (type_is_visit(type)) {
      console.error(`visitor.visit_${to_camel_case(type)}(&${name});`);
      return `visitor.visit_${to_camel_case(type)}(&${name});`;
    } else {
      const item = items_by_name[type];
      if (item && item.kind === "struct") {
        return visit_struct(item, name);
      } else if (item && item.kind === "enum") {
        return visit_enum(item, name);
      } else {
        return "";
      }
    }
  } else if (type[0] === "Box") {
    const result = `let ${name} = ${name}.as_ref();`;
    return result + visit_ty(type[1], name);
  } else if (type[0] === "Option") {
    return `if let Some(${name}) = ${name} {
	  ${visit_ty(type[1], name)}
	}`;
  } else if (type[0] === "Vec") {
    return `
	  for item in ${name} {
	    ${visit_ty(type[1], "item")}
	  }
	`;
  } else {
    throw new Error("Unexpected type: " + JSON.stringify(type));
  }
}

/**
 * @param {Type} type
 * @returns {string}
 */
function gen_ty(type) {
  if (typeof type === "string") {
    return type;
  } else {
    return `${type[0]}<${gen_ty(type[1])}>`;
  }
}

/**
 * @param {StructItem} item
 * @param {string} name
 * @returns {string}
 */
function visit_struct(item, name) {
  const field_decls = item.fields
    .map(([field_name, ty]) => {
      const visit = visit_ty(ty, field_name);
      return `{ let ${field_name} = &${name}.${field_name};
      ${visit}; }`;
    })
    .join("\n");
  return `
    ${field_decls}
  `.trim();
}

/**
 *
 * @param {string} name
 * @returns {string}
 */
function to_camel_case(name) {
  // split on uppercase letters
  const parts = name.split(/(?=[A-Z])/);
  return parts.map((part) => part.toLowerCase()).join("_");
}

/**
 *
 * @param {Type} type
 * @returns {boolean}
 */
function type_is_visit(type) {
  if (typeof type === "string") {
    return items_by_name[type]?.tags.includes("visit") ?? false;
  } else {
    if (type.length > 2) {
      throw new Error("Unexpected type: " + JSON.stringify(type));
    }
    const [container, arg] = type;
    return container === "Box" && type_is_visit(arg);
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
