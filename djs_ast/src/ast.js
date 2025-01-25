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
  ["Switch", Box(Expr), Vec("SwitchCase")],
  ["While", Box(Expr), Box(Stmt)],
  ["DoWhile", Box(Stmt), Box(Expr)],
  ["Try", Box("TryStmt")],
  ["For", "For"],
  ["ForInOrOf", "ForInOrOf"],
  ["Break", Option("Label")],
  ["Continue", Option("Label")],
  ["Debugger"],
  ["With", Box(Expr), Box(Stmt)],
  ["FunctionDecl", "Function"],
  ["ClassDecl", "Class"],
  ["Empty"],
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
  ["Boolean", "bool"],
  ["Object", Vec("ObjectLiteralEntry")],
  ["Throw", { tags: ["span"] }, Box(Expr)],
  ["PostIncrement", { tags: ["span"] }, Box(Expr)],
  ["PostDecrement", { tags: ["span"] }, Box(Expr)],
  ["PreIncrement", { tags: ["span"] }, Box(Expr)],
  ["PreDecrement", { tags: ["span"] }, Box(Expr)],
  ["Array", Vec("ArrayLiteralMember")],
  ["New", { tags: ["span"] }, Box(Expr)],
  ["Yield", Option(Box(Expr))],
  ["YieldFrom", { tags: ["span"] }, Box(Expr)],
  ["Ternary", Box(Expr), Box(Expr), Box(Expr)],
  ["Assign", Box(Expr), "AssignOp", Box(Expr)],
  ["Regex", "Text"],
  // Unary operators
  ["Delete", { tags: ["span"] }, Box(Expr)],
  ["Void", { tags: ["span"] }, Box(Expr)],
  ["TypeOf", { tags: ["span"] }, Box(Expr)],
  ["UnaryPlus", { tags: ["span"] }, Box(Expr)],
  ["UnaryMinus", { tags: ["span"] }, Box(Expr)],
  ["BitNot", { tags: ["span"] }, Box(Expr)],
  ["Not", { tags: ["span"] }, Box(Expr)],
  ["Await", { tags: ["span"] }, Box(Expr)],
  ["Comma", Vec(Expr)],

  ["Super"],
  ["Class", Box("Class")],
);
const StructClass = Struct(
  "Class",
  ["span"],
  ["name", Option("Ident")],
  ["superclass", Option(Expr)],
  ["body", "ClassBody"],
);
const StructBody = Struct(
  "ClassBody",
  ["span"],
  ["members", Vec("ClassMember")],
);
const EnumClassMember = Enum(
  "ClassMember",
  [],
  ["MethodDef", "MethodDef"],
  ["FieldDef", "FieldDef"],
);
const StructFieldDef = Struct(
  "FieldDef",
  ["span"],
  ["name", "Ident"],
  ["initializer", Option(Expr)],
);
const StructMethodDef = Struct(
  "MethodDef",
  ["span"],
  ["name", "ObjectKey"],
  ["body", "Function"],
  ["accessor_type", Option("AccessorType")],
);
const ast_items = [
  Struct("SourceFile", ["span"], ["stmts", Vec(Stmt)]),
  Struct("Ident", ["span"], ["text", "str"]),
  Struct("Text", ["span"], ["text", "str"]),
  Struct("Label", ["span"], ["name", "str"]),
  EnumStmt,
  StructClass,
  StructBody,
  StructMethodDef,
  EnumClassMember,
  StructFieldDef,
  Struct("SwitchCase", ["span"], ["test", Option(Expr)], ["body", Vec(Stmt)]),
  Struct(
    "ForInOrOf",
    ["span"],
    ["decl_type", Option("DeclType")], // None for `for (x of y) {}`
    ["lhs", "Pattern"],
    ["in_or_of", "InOrOf"],
    ["rhs", Expr],
    ["body", Box(Stmt)],
  ),
  Enum("InOrOf", [], "In", "Of"),
  Struct(
    "VarDecl",
    ["span"],

    ["decl_type", "DeclType"],
    ["declarators", Vec("VarDeclarator")],
  ),
  Struct("VarDeclarator", [], ["pattern", "Pattern"], ["init", Option(Expr)]),
  Struct(
    "For",
    ["span"],
    ["init", "ForInit"],
    ["test", Option(Expr)],
    ["update", Option(Expr)],
    ["body", Box(Stmt)],
  ),
  Enum("ForInit", [], ["VarDecl", "VarDecl"], [Expr, Expr]),
  Struct("Block", ["span"], ["stmts", Vec(Stmt)]),
  Struct(
    "TryStmt",
    ["span"],
    ["try_block", "Block"],
    ["catch_name", Option("Ident")],
    ["catch_block", Option("Block")],
    ["finally_block", Option("Block")],
  ),

  EnumExpr,
  Enum(
    "ObjectLiteralEntry",
    ["span"],
    ["Ident", "Ident"],
    ["Prop", "ObjectKey", Expr],
    ["Method", "MethodDef"],
    ["Spread", Expr],
  ),
  Enum(
    "ObjectKey",
    ["span"],
    ["Ident", "Ident"],
    ["String", "Text"],
    ["Computed", Expr],
  ),
  Struct("ParamList", ["span"], ["params", Vec("Param")]),
  Struct("Param", ["span"], ["pattern", "Pattern"]),
  Struct(
    "Function",
    ["span"],
    ["name", Option("Ident")],
    ["params", "ParamList"],
    ["body", "Block"],
    ["is_generator", "bool"],
    ["is_async", "bool"],
  ),
  Enum("ArrayLiteralMember", ["span"], ["Expr", Expr], "Elision", [
    "Spread",
    Expr,
  ]),
  Enum("ArrowFnBody", ["span"], [Expr, Box(Expr)], ["Block", "Block"]),
  Enum(
    "Pattern",
    ["span"],
    ["Var", "Ident"],
    ["Assignment", Box("Pattern"), Box(Expr)],
    ["Array", Vec(Option("Pattern"))],
    ["Object", "ObjectPattern"],
    ["Rest", Box("Pattern")],
  ),

  Struct(
    "ObjectPattern",
    ["span"],
    ["properties", Vec("ObjectPatternProperty")],
    ["rest", Option(Box("Pattern"))],
  ),

  Struct(
    "ObjectPatternProperty",
    ["span"],
    ["key", "ObjectKey"],
    ["value", "Pattern"],
  ),

  Enum(
    "BinOp",
    [],

    // Arithmetic
    "Add",
    "Sub",

    // Multiplicative
    "Mul",
    "Div",
    "Mod",

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
    "Instanceof",
  ),
  Enum(
    "AssignOp",
    [],
    "Eq",
    "MulEq",
    "DivEq",
    "ModEq",
    "AddEq",
    "SubEq",
    "LeftShiftEq",
    "RightShiftEq",
    "UnsignedRightShiftEq",
    "BitAndEq",
    "BitXorEq",
    "BitOrEq",
    "ExponentEq",
  ),
  Enum("DeclType", [], "Let", "Const", "Var"),
  Enum("AccessorType", [], "Get", "Set"),
];

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {...([string, ...Type[]] | ([string, { tags: Tag[] }, ...Type[]]) | string)} variants
 * @returns {EnumItem}
 */
function Enum(name, tags, ...variants) {
  return {
    kind: "enum",
    name,
    tags,
    variants: variants.map(
      /**
       * @returns {EnumVariant}
       */
      (variant) => {
        if (typeof variant === "string") {
          return { name: variant, args: [], tags: [] };
        } else if (typeof variant[1] === "object" && "tags" in variant[1]) {
          return {
            name: variant[0],
            tags: variant[1].tags,
            // @ts-ignore - TS doesn't understand that the previous check guarantees this
            args: variant.slice(2),
          };
        } else {
          // @ts-ignore - TS doesn't understand that the previous check guarantees this
          return { name: variant[0], args: variant.slice(1), tags: [] };
        }
      },
    ),
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
