/**
 * {@link DStmt}
 */
const Stmt = "Stmt";
/**
 * {@link DExpr}
 */
const Expr = "Expr";

/**
 * {@link DIdent}
 */
const Ident = "Ident";
/**
 * {@link DObjectKey}
 */
const ObjectKey = "ObjectKey";
const DIdent = Struct(Ident, ["span", "clone"], ["text", "str"]);

/**
 * {@link DPattern}
 */
const Pattern = "Pattern";
const DPattern = Enum(
  Pattern,
  ["span", "clone"],
  ["Var", Ident],
  ["Assignment", Box(Pattern), Box(Expr)],
  ["Array", Vec(Pattern)],
  ["Object", "ObjectPattern"],
  ["Prop", Box(Expr), ObjectKey],
  "Elision",
  ["Rest", Box(Pattern)],
);
const DStmt = Enum(
  Stmt,
  ["span", "clone"],
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

const DExpr = Enum(
  Expr,
  ["span", "clone"],
  ["Var", Ident],
  ["BinOp", Box(Expr), "BinOp", Box(Expr)],
  ["ArrowFn", "ParamList", "ArrowFnBody"],
  ["Function", "Function"],
  ["Call", Box(Expr), Vec(Expr)],
  ["Index", Box(Expr), Box(Expr)],
  ["Prop", Box(Expr), Ident],
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
  ["Assign", Box(Pattern), "AssignOp", Box(Expr)],
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
  ["TemplateLiteral", Vec("TemplateLiteralFragment")],
);
const DClass = Struct(
  "Class",
  ["span", "clone"],
  ["name", Option(Ident)],
  ["superclass", Option(Expr)],
  ["body", "ClassBody"],
);
const DClassBody = Struct(
  "ClassBody",
  ["span", "clone"],
  ["members", Vec("ClassMember")],
);
const DClassMember = Enum(
  "ClassMember",
  ["clone"],
  ["MethodDef", "MethodDef"],
  ["FieldDef", "FieldDef"],
);
const DFieldDef = Struct(
  "FieldDef",
  ["span", "clone"],
  ["name", Ident],
  ["initializer", Option(Expr)],
);
const DMethodDef = Struct(
  "MethodDef",
  ["span", "clone"],
  ["name", "ObjectKey"],
  ["body", "Function"],
  ["accessor_type", Option("AccessorType")],
);

const DObjectKey = Enum(
  ObjectKey,
  ["span", "clone"],
  [Ident, Ident],
  ["String", "Text"],
  ["Computed", Expr],
);

const DObjectLiteralEntry = Enum(
  "ObjectLiteralEntry",
  ["span", "clone"],
  [Ident, Ident],
  ["Prop", "ObjectKey", Expr],
  ["Method", "MethodDef"],
  ["Spread", Expr],
);

/**
 * {@link DArrayLiteralMember}
 */
const ArrayLiteralMember = "ArrayLiteralMember";
const DArrayLiteralMember = Enum(
  ArrayLiteralMember,
  ["span", "clone"],
  ["Expr", Expr],
  "Elision",
  ["Spread", Expr],
);

/**
 * {@link DFunction}
 */
const Function = "Function";
const DFunction = Struct(
  Function,
  ["span", "clone"],
  ["name", Option(Ident)],
  ["params", "ParamList"],
  ["body", "Block"],
  ["is_generator", "bool"],
  ["is_async", "bool"],
);
const ast_items = [
  Struct("SourceFile", ["span"], ["stmts", Vec(Stmt)]),
  Struct("Text", ["span", "clone"], ["text", "str"]),
  Struct("Label", ["span", "clone"], ["name", "str"]),
  DStmt,
  DClass,
  DClassBody,
  DMethodDef,
  DClassMember,
  DFieldDef,
  DIdent,
  DPattern,
  Struct(
    "SwitchCase",
    ["span", "clone"],
    ["test", Option(Expr)],
    ["body", Vec(Stmt)],
  ),
  Struct(
    "ForInOrOf",
    ["span", "clone"],
    ["decl_type", Option("DeclType")], // None for `for (x of y) {}`
    ["lhs", Pattern],
    ["in_or_of", "InOrOf"],
    ["rhs", Expr],
    ["body", Box(Stmt)],
  ),
  Enum("InOrOf", ["clone"], "In", "Of"),
  Struct(
    "VarDecl",
    ["span", "clone"],

    ["decl_type", "DeclType"],
    ["declarators", Vec("VarDeclarator")],
  ),
  Struct(
    "VarDeclarator",
    ["clone"],
    ["pattern", Pattern],
    ["init", Option(Expr)],
  ),
  Struct(
    "For",
    ["span", "clone"],
    ["init", "ForInit"],
    ["test", Option(Expr)],
    ["update", Option(Expr)],
    ["body", Box(Stmt)],
  ),
  Enum("ForInit", ["clone"], ["VarDecl", "VarDecl"], [Expr, Expr]),
  Struct("Block", ["span", "clone"], ["stmts", Vec(Stmt)]),
  Struct(
    "TryStmt",
    ["span", "clone"],
    ["try_block", "Block"],
    ["catch_pattern", Option(Pattern)],
    ["catch_block", Option("Block")],
    ["finally_block", Option("Block")],
  ),

  DExpr,
  DObjectLiteralEntry,
  DObjectKey,
  Struct("ParamList", ["span", "clone"], ["params", Vec("Param")]),
  Struct("Param", ["span", "clone"], ["pattern", Pattern]),
  DFunction,
  DArrayLiteralMember,
  Enum("ArrowFnBody", ["span", "clone"], [Expr, Box(Expr)], ["Block", "Block"]),
  Enum(
    "TemplateLiteralFragment",
    ["span", "clone"],
    ["Text", "Text"],
    ["Expr", Expr],
  ),

  Struct(
    "ObjectPattern",
    ["span", "clone"],
    ["properties", Vec("ObjectPatternProperty")],
    ["rest", Option(Box(Pattern))],
  ),

  Struct(
    "ObjectPatternProperty",
    ["span", "clone"],
    ["key", "ObjectKey"],
    ["value", Pattern],
  ),

  Enum(
    "BinOp",
    ["clone"],

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

    // Shift
    "LeftShift",
    "RightShift",
    "UnsignedRightShift",
  ),
  Enum(
    "AssignOp",
    ["clone"],
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
  Enum("DeclType", ["clone"], "Let", "Const", "Var"),
  Enum("AccessorType", ["clone"], "Get", "Set"),
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
