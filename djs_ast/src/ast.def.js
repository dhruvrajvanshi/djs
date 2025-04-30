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

const DIdent = Struct(Ident, ["span", "clone"], ["text", "str"]);

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
 * {@link DFor}
 */
const For = "For";
/**
 * {@link DTryStmt}
 */
const TryStmt = "TryStmt";
/**
 * {@link DSwitchCase}
 */
const SwitchCase = "SwitchCase";
/**
 * {@link DForInOrOf}
 */
const ForInOrOf = "ForInOrOf";
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
  ["span", "clone", "visit"],
  ["Var", Ident],
  ["Assignment", Pattern, Expr],
  ["Array", Array(Pattern)],
  ["Object", ObjectPattern],
  ["Prop", Expr, ObjectKey],
  "Elision",
  ["Rest", Pattern],
);
const DStmt = Enum(
  Stmt,
  ["span", "clone", "visit"],
  [Expr, Expr],
  ["Block", Block],
  ["Return", Option(Expr)],
  ["VarDecl", VarDecl],
  ["If", Expr, Stmt, Option(Stmt)],
  ["Switch", Expr, Array(SwitchCase)],
  ["While", Expr, Stmt],
  ["DoWhile", Stmt, Expr],
  ["Try", TryStmt],
  ["For", "For"],
  ["ForInOrOf", ForInOrOf],
  ["Break", Option(Label)],
  ["Continue", Option(Label)],
  ["Debugger"],
  ["With", Expr, Stmt],
  ["FunctionDecl", Function],
  ["ClassDecl", Class],
  ["Empty"],
);

const DExpr = Enum(
  Expr,
  ["span", "clone", "visit"],
  ["Var", Ident],
  ["BinOp", Expr, BinOp, Expr],
  ["ArrowFn", ParamList, ArrowFnBody],
  ["Function", Function],
  ["Call", Expr, Array(Expr)],
  ["Index", Expr, Expr],
  ["Prop", Expr, Ident],
  ["String", Text],
  ["Number", Text],
  ["Boolean", "bool"],
  ["Null"],
  ["Undefined"],
  ["Object", Array(ObjectLiteralEntry)],
  ["Throw", { tags: ["span"] }, Expr],
  ["PostIncrement", { tags: ["span"] }, Expr],
  ["PostDecrement", { tags: ["span"] }, Expr],
  ["PreIncrement", { tags: ["span"] }, Expr],
  ["PreDecrement", { tags: ["span"] }, Expr],
  ["Array", Array(ArrayLiteralMember)],
  ["New", { tags: ["span"] }, Expr],
  ["Yield", Option(Expr)],
  ["YieldFrom", { tags: ["span"] }, Expr],
  ["Ternary", Expr, Expr, Expr],
  ["Assign", Pattern, AssignOp, Expr],
  ["Regex", "Text"],
  // Unary operators
  ["Delete", { tags: ["span"] }, Expr],
  ["Void", { tags: ["span"] }, Expr],
  ["TypeOf", { tags: ["span"] }, Expr],
  ["UnaryPlus", { tags: ["span"] }, Expr],
  ["UnaryMinus", { tags: ["span"] }, Expr],
  ["BitNot", { tags: ["span"] }, Expr],
  ["Not", { tags: ["span"] }, Expr],
  ["Await", { tags: ["span"] }, Expr],
  ["Comma", Array(Expr)],

  ["Super"],
  ["Class", "Class"],
  ["TemplateLiteral", Array(TemplateLiteralFragment)],
);
const DClass = Struct(
  Class,
  ["span", "clone"],
  ["name", Option(Ident)],
  ["superclass", Option(Expr)],
  ["body", ClassBody],
);
const DClassBody = Struct(
  ClassBody,
  ["span", "clone"],
  ["members", Array(ClassMember)],
);
const DClassMember = Enum(
  ClassMember,
  ["clone"],
  ["MethodDef", MethodDef],
  ["FieldDef", FieldDef],
);
const DFieldDef = Struct(
  "FieldDef",
  ["span", "clone"],
  ["name", Ident],
  ["initializer", Option(Expr)],
);
const DMethodDef = Struct(
  MethodDef,
  ["span", "clone"],
  ["name", ObjectKey],
  ["body", Function],
  ["accessor_type", Option(AccessorType)],
);

const DObjectKey = Enum(
  ObjectKey,
  ["span", "clone"],
  [Ident, Ident],
  ["String", Text],
  ["Computed", Expr],
);

const DObjectLiteralEntry = Enum(
  ObjectLiteralEntry,
  ["span", "clone"],
  [Ident, Ident],
  ["Prop", ObjectKey, Expr],
  ["Method", MethodDef],
  ["Spread", Expr],
);

const DParamList = Struct(ParamList, ["span", "clone"], ["params", Array(Param)]);

const DParam = Struct(Param, ["span", "clone"], ["pattern", Pattern]);

const DArrayLiteralMember = Enum(
  ArrayLiteralMember,
  ["span", "clone"],
  ["Expr", Expr],
  "Elision",
  ["Spread", Expr],
);

const DFunction = Struct(
  Function,
  ["span", "clone"],
  ["name", Option(Ident)],
  ["params", ParamList],
  ["body", Block],
  ["is_generator", "bool"],
  ["is_async", "bool"],
);
const DBlock = Struct(Block, ["span", "clone"], ["stmts", Array(Stmt)]);
const DText = Struct(Text, ["span", "clone"], ["text", "str"]);
const DLabel = Struct(Label, ["span", "clone"], ["name", "str"]);

const DSourceFile = Struct(SourceFile, ["span", "visit"], ["stmts", Array(Stmt)]);
const DSwitchCase = Struct(
  SwitchCase,
  ["span", "clone"],
  ["test", Option(Expr)],
  ["body", Array(Stmt)],
);
const DForInOrOf = Struct(
  ForInOrOf,
  ["span", "clone"],
  ["decl_type", Option(DeclType)], // None for `for (x of y) {}`
  ["lhs", Pattern],
  ["in_or_of", InOrOf],
  ["rhs", Expr],
  ["body", Stmt],
);
const DInOrOf = Enum(InOrOf, ["clone"], "In", "Of");
const DVarDecl = Struct(
  VarDecl,
  ["span", "clone"],
  ["decl_type", DeclType],
  ["declarators", Array(VarDeclarator)],
);
const DVarDeclarator = Struct(
  VarDeclarator,
  ["clone"],
  ["pattern", Pattern],
  ["init", Option(Expr)],
);
const DFor = Struct(
  For,
  ["span", "clone"],
  ["init", ForInit],
  ["test", Option(Expr)],
  ["update", Option(Expr)],
  ["body", Stmt],
);
const DForInit = Enum(ForInit, ["clone"], ["VarDecl", VarDecl], [Expr, Expr]);
const DTryStmt = Struct(
  TryStmt,
  ["span", "clone"],
  ["try_block", Block],
  ["catch_pattern", Option(Pattern)],
  ["catch_block", Option(Block)],
  ["finally_block", Option(Block)],
);
const DArrowFnBody = Enum(
  ArrowFnBody,
  ["span", "clone"],
  [Expr, Expr],
  ["Block", Block],
);
const DTemplateLiteralFragment = Enum(
  TemplateLiteralFragment,
  ["span", "clone"],
  ["Text", Text],
  ["Expr", Expr],
);
const DObjectPattern = Struct(
  ObjectPattern,
  ["span", "clone"],
  ["properties", Array("ObjectPatternProperty")],
  ["rest", Option(Pattern)],
);
const DObjectPatternProperty = Struct(
  ObjectPatternProperty,
  ["span", "clone"],
  ["key", ObjectKey],
  ["value", Pattern],
);
const DBinOp = Enum(
  BinOp,
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
);
const DAssignOp = Enum(
  AssignOp,
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
);
const DDeclType = Enum(DeclType, ["clone"], "Let", "Const", "Var");
const DAccessorType = Enum(AccessorType, ["clone"], "Get", "Set");

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
  DForInOrOf,
  DInOrOf,
  DVarDecl,
  DVarDeclarator,
  DFor,
  DForInit,
  DTryStmt,
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
            variant.args.length > 0 &&
            variant.args.some(type_contains_ident_or_text),
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
