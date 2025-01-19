/**
 * {@link EnumStmt}
 */
const Stmt = "Stmt";
/**
 * {@link EnumExpr}
 */
const Expr = "Expr";

const EnumStmt = Enum(
  Stmt,
  ["span"],
  [Expr, Box(Expr)],
  ["Block", "Block"],
  ["Return", Option(Expr)],
  ["VarDecl", "VarDecl"],
  ["If", Box(Expr), Box(Stmt), Option(Box(Stmt))],
  ["While", Box(Expr), Box(Stmt)],
  ["Try", Box("TryStmt")],
  ["For", "For"],
  ["ForInOrOf", "ForInOrOf"],
  ["Break", Option("Label")],
  ["Continue", Option("Label")],
  ["Debugger"],
  ["With", Box(Expr), Box(Stmt)],
  ["Empty"]
);
const EnumExpr = Enum(
  Expr,
  ["span"],
  ["Var", "Ident"],
  ["BinOp", Box(Expr), "BinOp", Box(Expr)],
  ["ArrowFn", "ParamList", "ArrowFnBody"],
  ["Function", "Function"],
  ["Call", Box(Expr), Vec(Expr)],
  ["Index", Box(Expr), Box(Expr)],
  ["Prop", Box(Expr), "Ident"],
  ["String", "Text"],
  ["Number", "Text"],
  ["Object", Vec("ObjectLiteralEntry")],
  ["Throw", Box(Expr)],
  ["PostIncrement", Box(Expr)],
  ["PostDecrement", Box(Expr)],
  ["Array", Vec(Expr)],
  ["New", Box(Expr), Vec(Expr)],
  ["Yield", Option(Box(Expr))],
  ["Ternary", Box(Expr), Box(Expr), Box(Expr)],
  ["Assign", Box(Expr), Box(Expr)]
);
const ast_items = [
  Struct("SourceFile", ["span"], ["stmts", Vec(Stmt)]),
  Struct("Ident", ["span"], ["text", "str"]),
  Struct("Text", ["span"], ["text", "str"]),
  Struct("Label", ["span"], ["name", "str"]),
  EnumStmt,
  Struct(
    "ForInOrOf",
    ["span"],
    ["decl_type", Option("DeclType")], // None for `for (x of y) {}`
    ["lhs", "Pattern"],
    ["in_or_of", "InOrOf"],
    ["rhs", Expr],
    ["body", Box(Stmt)]
  ),
  Enum("InOrOf", [], "In", "Of"),
  Struct(
    "VarDecl",
    ["span"],
    ["decl_type", "DeclType"],
    ["pattern", "Pattern"],
    ["init", Option(Expr)]
  ),
  Struct(
    "For",
    ["span"],
    ["init", "ForInit"],
    ["test", Option(Expr)],
    ["update", Option(Expr)],
    ["body", Box(Stmt)]
  ),
  Enum("ForInit", [], ["VarDecl", "VarDecl"], [Expr, Expr]),
  Struct("Block", ["span"], ["stmts", Vec(Stmt)]),
  Struct(
    "TryStmt",
    ["span"],
    ["try_block", "Block"],
    ["catch_name", Option("Ident")],
    ["catch_block", Option("Block")],
    ["finally_block", Option("Block")]
  ),

  EnumExpr,
  Struct("ObjectLiteralEntry", ["span"], ["key", "Ident"], ["value", Expr]),
  Struct("ParamList", ["span"], ["params", Vec("Param")]),
  Struct("Param", ["span"], ["name", "Ident"], ["default", Option(Expr)]),
  Struct(
    "Function",
    ["span"],
    ["name", Option("Ident")],
    ["params", "ParamList"],
    ["body", "Block"],
    ["is_generator", "bool"]
  ),
  Enum("ArrowFnBody", ["span"], [Expr, Box(Expr)], ["Block", "Block"]),
  Enum("Pattern", ["span"], ["Var", "Ident"]),

  Enum(
    "BinOp",
    [],

    // Arithmetic
    "Add",
    "Sub",

    // Multiplicative
    "Mul",
    "Div",

    // Bitwise
    "BitXor",
    "BitAnd",
    "BitOr",

    // Logical
    "And",
    "Or",

    // Relational
    "Gt",
    "Lt",
    "Gte",
    "Lte",

    // Equality
    "EqEq",
    "EqEqEq",
    "NotEq",
    "NotEqEq",
    "In",
    "Instanceof"
  ),
  Enum("DeclType", [], "Let", "Const", "Var"),
];

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {...([string, ...Type[]] | string)} variants
 * @returns {EnumItem}
 */
function Enum(name, tags, ...variants) {
  return {
    kind: "enum",
    name,
    tags,
    variants: variants.map((variant) => {
      if (typeof variant === "string") {
        return { name: variant, args: [] };
      } else {
        return { name: variant[0], args: variant.slice(1) };
      }
    }),
  };
}

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {...[string, Type]} fields
 * @returns {StructItem}
 */
function Struct(name, tags, ...fields) {
  return {
    kind: "struct",
    name,
    tags,
    fields,
  };
}
/**
 *
 * @template {Type} T
 * @param {T} type
 * @returns {["Option", T]}
 */
function Option(type) {
  return ["Option", type];
}

/**
 * @template {Type} T
 * @param {T} type
 * @returns {["Box", T]}
 */
function Box(type) {
  return ["Box", type];
}

/**
 * @template {Type} T
 * @param {T} type
 * @returns {["Vec", T]}
 */
function Vec(type) {
  return ["Vec", type];
}
module.exports = { ast_items };
