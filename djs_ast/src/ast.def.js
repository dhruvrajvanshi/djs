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
 * {@link DFunction}
 */
const Function = "Function";

/**
 * {@link DObjectKey}
 */
const ObjectKey = "ObjectKey";

/**
 * {@link DText}
 */
const Text = "Text";

/**
 * {@link DLabel}
 */
const Label = "Label";

/**
 * {@link DParamList}
 */
const ParamList = "ParamList";

/**
 * {@link DParam}
 */
const Param = "Param";

/**
 * {@link DMethodDef}
 */
const MethodDef = "MethodDef";

/**
 * {@link DBlock}
 */
const Block = "Block";

const DIdent = Struct(Ident, ["span"], ["text", "str"]);

/**
 * {@link DPattern}
 */
const Pattern = "Pattern";

/**
 * {@link DArrowFnBody}
 */
const ArrowFnBody = "ArrowFnBody";
/**
 * {@link DTemplateLiteralFragment}
 */
const TemplateLiteralFragment = "TemplateLiteralFragment";
/**
 * {@link DObjectPattern}
 */
const ObjectPattern = "ObjectPattern";
/**
 * {@link DObjectPatternProperty}
 */
const ObjectPatternProperty = "ObjectPatternProperty";
/**
 * {@link DBinOp}
 */
const BinOp = "BinOp";
/**
 * {@link DAssignOp}
 */
const AssignOp = "AssignOp";
/**
 * {@link DDeclType}
 */
const DeclType = "DeclType";
/**
 * {@link DAccessorType}
 */
const AccessorType = "AccessorType";
/**
 * {@link DVarDecl}
 */
const VarDecl = "VarDecl";
/**
 * {@link DSwitchCase}
 */
const SwitchCase = "SwitchCase";
/**
 * {@link DInOrOf}
 */
const InOrOf = "InOrOf";
/**
 * {@link DVarDeclarator}
 */
const VarDeclarator = "VarDeclarator";
/**
 * {@link DObjectLiteralEntry}
 */
const ObjectLiteralEntry = "ObjectLiteralEntry";
/**
 * {@link DClass}
 */
const Class = "Class";
/**
 * {@link DFieldDef}
 */
const FieldDef = "FieldDef";
/**
 * {@link DClassMember}
 */
const ClassMember = "ClassMember";
/**
 * {@link DClassBody}
 */
const ClassBody = "ClassBody";
/**
 * {@link DForInit}
 */
const ForInit = "ForInit";
/**
 * {@link DArrayLiteralMember}
 */
const ArrayLiteralMember = "ArrayLiteralMember";
/**
 * {@link DSourceFile}
 */
const SourceFile = "SourceFile";

const DPattern = Enum(
  Pattern,
  ["span", "visit"],
  ["Var", { ident: Ident }],
  ["Assignment", { pattern: Pattern, initializer: Expr }],
  ["Array", { items: Array(Pattern) }],
  [
    "Object",
    { properties: Array("ObjectPatternProperty"), rest: Option(Pattern) },
  ],
  ["Prop", { expr: Expr, key: ObjectKey }],
  "Elision",
  ["Rest", { pattern: Pattern }],
);
const DStmt = Enum(
  Stmt,
  ["span", "visit"],
  [Expr, { expr: Expr }],
  ["Block", { block: Block }],
  ["Return", { value: Option(Expr) }],
  ["VarDecl", { decl: VarDecl }],
  ["If", { condition: Expr, if_true: Stmt, if_false: Option(Stmt) }],
  ["Switch", { condition: Expr, cases: Array(SwitchCase) }],
  ["While", { condition: Expr, body: Stmt }],
  ["DoWhile", { body: Stmt, condition: Expr }],
  [
    "Try",
    {
      try_block: Block,
      catch_pattern: Option(Pattern),
      catch_block: Option(Block),
      finally_block: Option(Block),
    },
  ],
  [
    "For",
    { init: ForInit, test: Option(Expr), update: Option(Expr), body: Stmt },
  ],
  [
    "ForInOrOf",
    {
      decl_type: Option(DeclType), // None for `for (x of y) {}`
      lhs: Pattern,
      in_or_of: InOrOf,
      rhs: Expr,
      body: Stmt,
    },
  ],
  ["Break", { label: Option(Label) }],
  ["Continue", { label: Option(Label) }],
  "Debugger",
  ["With", { expr: Expr, body: Stmt }],
  ["FunctionDecl", { func: Function }],
  ["ClassDecl", { class: Class }],
  "Empty",
);

const DExpr = Enum(
  Expr,
  ["span", "visit"],
  ["Var", { ident: Ident }],
  ["BinOp", { lhs: Expr, operator: BinOp, rhs: Expr }],
  ["ArrowFn", { params: ParamList, body: ArrowFnBody }],
  ["Function", { func: Function }],
  ["Call", { callee: Expr, args: Array(Expr) }],
  ["Index", { lhs: Expr, property: Expr }],
  ["Prop", { lhs: Expr, property: Ident }],
  ["String", { text: Text }],
  ["Number", { text: Text }],
  ["Boolean", { value: "boolean" }],
  ["Null"],
  ["Undefined"],
  ["Object", { entries: Array(ObjectLiteralEntry) }],
  ["Throw", { tags: ["span"] }, { value: Expr }],
  ["PostIncrement", { tags: ["span"] }, { value: Expr }],
  ["PostDecrement", { tags: ["span"] }, { value: Expr }],
  ["PreIncrement", { tags: ["span"] }, { value: Expr }],
  ["PreDecrement", { tags: ["span"] }, { value: Expr }],
  ["Array", { items: Array(ArrayLiteralMember) }],
  ["New", { tags: ["span"] }, { expr: Expr }],
  ["Yield", { value: Option(Expr) }],
  ["YieldFrom", { tags: ["span"] }, { expr: Expr }],
  ["Ternary", { condition: Expr, if_true: Expr, if_false: Expr }],
  ["Assign", { pattern: Pattern, operator: AssignOp, value: Expr }],
  ["Regex", { text: "Text" }],
  // Unary operators
  ["Delete", { tags: ["span"] }, { expr: Expr }],
  ["Void", { tags: ["span"] }, { expr: Expr }],
  ["TypeOf", { tags: ["span"] }, { expr: Expr }],
  ["UnaryPlus", { tags: ["span"] }, { expr: Expr }],
  ["UnaryMinus", { tags: ["span"] }, { expr: Expr }],
  ["BitNot", { tags: ["span"] }, { expr: Expr }],
  ["Not", { tags: ["span"] }, { expr: Expr }],
  ["Await", { tags: ["span"] }, { expr: Expr }],
  ["Comma", { items: Array(Expr) }],

  ["Super"],
  ["Class", { class: "Class" }],
  ["TemplateLiteral", { fragments: Array(TemplateLiteralFragment) }],
);
const DClass = Struct(
  Class,
  ["span"],
  ["name", Option(Ident)],
  ["superclass", Option(Expr)],
  ["body", ClassBody],
);
const DClassBody = Struct(ClassBody, ["span"], ["members", Array(ClassMember)]);
const DClassMember = Enum(
  ClassMember,
  [],
  ["MethodDef", { method: MethodDef }],
  ["FieldDef", { field: FieldDef }],
);
const DFieldDef = Struct(
  "FieldDef",
  ["span"],
  ["name", Ident],
  ["initializer", Option(Expr)],
);
const DMethodDef = Struct(
  MethodDef,
  ["span"],
  ["name", ObjectKey],
  ["body", Function],
  ["accessor_type", Option(AccessorType)],
);

const DObjectKey = Enum(
  ObjectKey,
  ["span"],
  [Ident, { ident: Ident }],
  ["String", { text: Text }],
  ["Computed", { expr: Expr }],
);

const DObjectLiteralEntry = Enum(
  ObjectLiteralEntry,
  ["span"],
  [Ident, { ident: Ident }],
  ["Prop", { key: ObjectKey, value: Expr }],
  ["Method", { method: MethodDef }],
  ["Spread", { expr: Expr }],
);

const DParamList = Struct(ParamList, ["span"], ["params", Array(Param)]);

const DParam = Struct(Param, ["span"], ["pattern", Pattern]);

const DArrayLiteralMember = Enum(
  ArrayLiteralMember,
  ["span"],
  ["Expr", { expr: Expr }],
  "Elision",
  ["Spread", { expr: Expr }],
);

const DFunction = Struct(
  Function,
  ["span"],
  ["name", Option(Ident)],
  ["params", ParamList],
  ["body", Block],
  ["is_generator", "boolean"],
  ["is_async", "boolean"],
);
const DBlock = Struct(Block, ["span"], ["stmts", Array(Stmt)]);
const DText = Struct(Text, ["span"], ["text", "str"]);
const DLabel = Struct(Label, ["span"], ["name", "str"]);

const DSourceFile = Struct(
  SourceFile,
  ["span", "visit"],
  ["stmts", Array(Stmt)],
);
const DSwitchCase = Struct(
  SwitchCase,
  ["span"],
  ["test", Option(Expr)],
  ["body", Array(Stmt)],
);
const DInOrOf = Enum(InOrOf, [], "In", "Of");
const DVarDecl = Struct(
  VarDecl,
  ["span"],
  ["decl_type", DeclType],
  ["declarators", Array(VarDeclarator)],
);
const DVarDeclarator = Struct(
  VarDeclarator,
  [],
  ["pattern", Pattern],
  ["init", Option(Expr)],
);
const DForInit = Enum(
  ForInit,
  [],
  ["VarDecl", { decl: VarDecl }],
  [Expr, { expr: Expr }],
);
const DArrowFnBody = Enum(
  ArrowFnBody,
  ["span"],
  [Expr, { expr: Expr }],
  ["Block", { block: Block }],
);
const DTemplateLiteralFragment = Enum(
  TemplateLiteralFragment,
  ["span"],
  ["Text", { text: Text }],
  ["Expr", { expr: Expr }],
);
const DObjectPattern = Struct(ObjectPattern, ["span"]);
const DObjectPatternProperty = Struct(
  ObjectPatternProperty,
  ["span"],
  ["key", ObjectKey],
  ["value", Pattern],
);
const DBinOp = Enum(
  BinOp,
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
  // Shift
  "LeftShift",
  "RightShift",
  "UnsignedRightShift",
);
const DAssignOp = Enum(
  AssignOp,
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
);
const DDeclType = Enum(DeclType, [], "Let", "Const", "Var");
const DAccessorType = Enum(AccessorType, [], "Get", "Set");

const ast_items = [
  DSourceFile,
  DText,
  DStmt,
  DClass,
  DBlock,
  DClassBody,
  DMethodDef,
  DClassMember,
  DFieldDef,
  DIdent,
  DPattern,
  DLabel,
  DSwitchCase,
  DInOrOf,
  DVarDecl,
  DVarDeclarator,
  DForInit,
  DExpr,
  DObjectLiteralEntry,
  DObjectKey,
  DParamList,
  DParam,
  DFunction,
  DArrayLiteralMember,
  DArrowFnBody,
  DTemplateLiteralFragment,
  DObjectPattern,
  DObjectPatternProperty,
  DBinOp,
  DAssignOp,
  DDeclType,
  DAccessorType,
];

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {...([string, Record<string, Type>] | ([string, { tags: Tag[] }, Record<string, Type>]) | [string] | string)} variants
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
          return { name: variant, args: {}, tags: [] };
        } else if (variant.length === 2) {
          const name = variant[0];
          return {
            name,
            tags: [],
            args: variant[1],
          };
        } else if (variant.length === 3) {
          return { name: variant[0], args: variant[2], tags: variant[1].tags };
        } else {
          return { name: variant[0], args: {}, tags: [] };
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
 * @returns {["Vec", T]}
 */
function Array(type) {
  return ["Vec", type];
}

const items_by_name = Object.fromEntries(
  ast_items.map((item) => [item.name, item]),
);

const needs_lifetime_param = needs_lifetime_param_set();
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
          type_contains_ident_or_text(type),
        );
      case "enum":
        return item.variants.some(
          (variant) =>
            Object.keys(variant.args).length > 0 &&
            Object.values(variant.args).some(type_contains_ident_or_text),
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

export { ast_items, items_by_name, needs_lifetime_param };
