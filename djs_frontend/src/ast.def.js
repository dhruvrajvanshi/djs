/**
 * {@link DStmt}
 */
const Stmt = "Stmt"
/**
 * {@link DExpr}
 */
const Expr = "Expr"
/**
 * {@link DTypeAnnotation}
 */
const TypeAnnotation = "TypeAnnotation"

/**
 * {@link DIdent}
 */
const Ident = "Ident"

/**
 * {@link DFunc}
 */
const Func = "Func"

/**
 * {@link DObjectKey}
 */
const ObjectKey = "ObjectKey"

/**
 * {@link DText}
 */
const Text = "Text"

/**
 * {@link DLabel}
 */
const Label = "Label"

/**
 * {@link DParamList}
 */
const ParamList = "ParamList"

/**
 * {@link DParam}
 */
const Param = "Param"

/**
 * {@link DMethodDef}
 */
const MethodDef = "MethodDef"

/**
 * {@link DBlock}
 */
const Block = "Block"

const DIdent = Struct("Ident", ["span"], {
  text: "str",
})

/**
 * {@link DPattern}
 */
const Pattern = "Pattern"

/**
 * {@link DArrowFnBody}
 */
const ArrowFnBody = "ArrowFnBody"
/**
 * {@link DTemplateLiteralFragment}
 */
const TemplateLiteralFragment = "TemplateLiteralFragment"

/**
 * {@link DBinOp}
 */
const BinOp = "BinOp"
/**
 * {@link DAssignOp}
 */
const AssignOp = "AssignOp"
/**
 * {@link DDeclType}
 */
const DeclType = "DeclType"
/**
 * {@link DAccessorType}
 */
const AccessorType = "AccessorType"
/**
 * {@link DVarDecl}
 */
const VarDecl = "VarDecl"
/**
 * {@link DSwitchCase}
 */
const SwitchCase = "SwitchCase"
/**
 * {@link DInOrOf}
 */
const InOrOf = "InOrOf"
/**
 * {@link DVarDeclarator}
 */
const VarDeclarator = "VarDeclarator"
/**
 * {@link DObjectLiteralEntry}
 */
const ObjectLiteralEntry = "ObjectLiteralEntry"
/**
 * {@link DClass}
 */
const Class = "Class"
/**
 * {@link DFieldDef}
 */
const FieldDef = "FieldDef"
/**
 * {@link DClassMember}
 */
const ClassMember = "ClassMember"
/**
 * {@link DClassBody}
 */
const ClassBody = "ClassBody"
/**
 * {@link DForInit}
 */
const ForInit = "ForInit"
/**
 * {@link DArrayLiteralMember}
 */
const ArrayLiteralMember = "ArrayLiteralMember"

const DPattern = Enum(Pattern, ["span", "visit"], {
  Var: { ident: Ident },
  Assignment: { pattern: Pattern, initializer: Expr },
  Array: { items: Array(Pattern) },
  Object: { properties: Array("ObjectPatternProperty"), rest: Option(Pattern) },
  Prop: { expr: Expr, key: ObjectKey },
  Elision: {},
  Rest: { pattern: Pattern },
})
const DStmt = Enum(Stmt, ["span", "visit"], {
  Expr: { expr: Expr },
  Block: { block: Block },
  Return: { value: Option(Expr) },
  VarDecl: { decl: VarDecl },
  If: { condition: Expr, if_true: Stmt, if_false: Option(Stmt) },
  Switch: { condition: Expr, cases: Array(SwitchCase) },
  While: { condition: Expr, body: Stmt },
  DoWhile: { body: Stmt, condition: Expr },
  Try: {
    try_block: Block,
    catch_pattern: Option(Pattern),
    catch_block: Option(Block),
    finally_block: Option(Block),
  },
  For: { init: ForInit, test: Option(Expr), update: Option(Expr), body: Stmt },
  ForInOrOf: {
    decl_type: Option(DeclType), // None for `for (x of y) {}`
    lhs: Pattern,
    in_or_of: InOrOf,
    rhs: Expr,
    body: Stmt,
  },
  Break: { label: Option(Label) },
  Continue: { label: Option(Label) },
  Debugger: {},
  With: { expr: Expr, body: Stmt },
  Func: { func: Func },
  ClassDecl: { class: Class },
  Empty: {},
})

const DExpr = Enum(Expr, ["span", "visit"], {
  Var: { ident: Ident },
  BinOp: { lhs: Expr, operator: BinOp, rhs: Expr },
  ArrowFn: {
    params: ParamList,
    return_type: Option(TypeAnnotation),
    body: ArrowFnBody,
  },
  Func: { func: Func },
  Call: { callee: Expr, args: Array(Expr) },
  Index: { lhs: Expr, property: Expr },
  Prop: { lhs: Expr, property: Ident },
  String: { text: Text },
  Number: { text: Text },
  Boolean: { value: "boolean" },
  Null: {},
  Undefined: {},
  Object: { entries: Array(ObjectLiteralEntry) },
  Throw: { value: Expr },
  PostIncrement: { value: Expr },
  PostDecrement: { value: Expr },
  PreIncrement: { value: Expr },
  PreDecrement: { value: Expr },
  Array: { items: Array(ArrayLiteralMember) },
  New: { expr: Expr },
  Yield: { value: Option(Expr) },
  YieldFrom: { expr: Expr },
  Ternary: { condition: Expr, if_true: Expr, if_false: Expr },
  Assign: { pattern: Pattern, operator: AssignOp, value: Expr },
  Regex: { text: "Text" },
  Delete: { expr: Expr },
  Void: { expr: Expr },
  TypeOf: { expr: Expr },
  UnaryPlus: { expr: Expr },
  UnaryMinus: { expr: Expr },
  BitNot: { expr: Expr },
  Not: { expr: Expr },
  Await: { expr: Expr },
  Comma: { items: Array(Expr) },
  Super: {},
  Class: { class: "Class" },
  TemplateLiteral: { fragments: Array(TemplateLiteralFragment) },
})
const DTypeAnnotation = Enum("TypeAnnotation", [], {
  Ident: { ident: Ident },
})
const DClass = Struct(Class, ["span"], {
  name: Option(Ident),
  superclass: Option(Expr),
  body: ClassBody,
})
const DClassBody = Struct(ClassBody, ["span"], {
  members: Array(ClassMember),
})
const DClassMember = Enum(ClassMember, [], {
  MethodDef: { method: MethodDef },
  FieldDef: { field: FieldDef },
})
const DFieldDef = Struct("FieldDef", ["span"], {
  name: Ident,
  initializer: Option(Expr),
})
const DMethodDef = Struct(MethodDef, ["span"], {
  name: ObjectKey,
  body: Func,
  return_type: Option(TypeAnnotation),
  accessor_type: Option(AccessorType),
})

const DObjectKey = Enum(ObjectKey, ["span"], {
  Ident: { ident: Ident },
  String: { text: Text },
  Computed: { expr: Expr },
})

const DObjectLiteralEntry = Enum(ObjectLiteralEntry, ["span"], {
  Ident: { ident: Ident },
  Prop: { key: ObjectKey, value: Expr },
  Method: { method: MethodDef },
  Spread: { expr: Expr },
})

const DParamList = Struct(ParamList, ["span"], {
  params: Array(Param),
})

const DParam = Struct(Param, ["span"], {
  pattern: Pattern,
  type_annotation: Option(TypeAnnotation),
})

const DArrayLiteralMember = Enum(ArrayLiteralMember, ["span"], {
  Expr: { expr: Expr },
  Elision: {},
  Spread: { expr: Expr },
})

const DFunc = Struct("Func", ["span"], {
  name: Option(Ident),
  params: ParamList,
  body: Block,
  return_type: Option(TypeAnnotation),
  is_generator: "boolean",
  is_async: "boolean",
})
const DBlock = Struct("Block", ["span"], {
  stmts: Array(Stmt),
})

const DLabel = Struct("Label", ["span"], {
  name: "str",
})

const DParseError = Struct("ParseError", ["span"], {
  message: "str",
})

const DSourceFile = Struct("SourceFile", ["span", "visit"], {
  stmts: Array(Stmt),
  errors: Array("ParseError"),
})
const DSwitchCase = Struct("SwitchCase", ["span"], {
  test: Option(Expr),
  body: Array(Stmt),
})
const DInOrOf = StringUnion(InOrOf, "In", "Of")
const DVarDecl = Struct("VarDecl", ["span"], {
  decl_type: DeclType,
  declarators: Array(VarDeclarator),
})
const DVarDeclarator = Struct("VarDeclarator", [], {
  pattern: Pattern,
  init: Option(Expr),
})
const DForInit = Enum(ForInit, [], {
  VarDecl: { decl: VarDecl },
  Expr: { expr: Expr },
})
const DArrowFnBody = Enum(ArrowFnBody, ["span"], {
  Expr: { expr: Expr },
  Block: { block: Block },
})
const DTemplateLiteralFragment = Enum(TemplateLiteralFragment, ["span"], {
  Text: { text: Text },
  Expr: { expr: Expr },
})
const DObjectPatternProperty = Struct("ObjectPatternProperty", ["span"], {
  key: ObjectKey,
  value: Pattern,
})
const DBinOp = StringUnion(
  BinOp,
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
)
const DAssignOp = StringUnion(
  AssignOp,
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
)
const DDeclType = StringUnion(DeclType, "Let", "Const", "Var")
const DAccessorType = StringUnion(AccessorType, "Get", "Set")

const ast_items = [
  DSourceFile,
  DParseError,
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
  DTypeAnnotation,
  DObjectLiteralEntry,
  DObjectKey,
  DParamList,
  DParam,
  DFunc,
  DArrayLiteralMember,
  DArrowFnBody,
  DTemplateLiteralFragment,
  DObjectPatternProperty,
  DBinOp,
  DAssignOp,
  DDeclType,
  DAccessorType,
]

/**
 *
 * @param {string} name
 * @param  {...string} variants
 * @returns {EnumItem}
 */
function StringUnion(name, ...variants) {
  return {
    kind: "enum",
    name,
    tags: [],
    variants: variants.map((variant) => ({
      name: variant,
      args: {},
      tags: [],
    })),
  }
}

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {Record<string, Record<string, Type>>} variants
 * @returns {EnumItem}
 */
function Enum(name, tags, variants) {
  return {
    kind: "enum",
    name,
    tags,
    variants: Object.entries(variants).map(
      /**
       * @returns {EnumVariant}
       */
      ([name, args]) => {
        return {
          name,
          tags: [],
          args,
        }
      },
    ),
  }
}

/**
 * @param {string} name
 * @param {Tag[]} tags
 * @param {Record<string, Type>} fields
 * @returns {StructItem}
 */
function Struct(name, tags, fields) {
  return {
    kind: "struct",
    name,
    tags,
    fields,
  }
}

/**
 *
 * @template {Type} T
 * @param {T} type
 * @returns {["Option", T]}
 */
function Option(type) {
  return ["Option", type]
}

/**
 * @template {Type} T
 * @param {T} type
 * @returns {["Vec", T]}
 */
function Array(type) {
  return ["Vec", type]
}

const items_by_name = Object.fromEntries(
  ast_items.map((item) => [item.name, item]),
)

const needs_lifetime_param = needs_lifetime_param_set()
function needs_lifetime_param_set() {
  const result = new Set()

  for (const item of ast_items) {
    if (item_contains_ident_or_text(item)) {
      result.add(item.name)
    }
  }

  return result

  /**
   * @param {Item} item
   * @returns {boolean}
   **/
  function item_contains_ident_or_text(item) {
    if (result.has(item.name)) {
      return true
    }
    switch (item.kind) {
      case "struct":
        return Object.entries(item.fields).some(([_, type]) =>
          type_contains_ident_or_text(type),
        )
      case "enum":
        return item.variants.some(
          (variant) =>
            Object.keys(variant.args).length > 0 &&
            Object.values(variant.args).some(type_contains_ident_or_text),
        )
    }
  }

  /**
   * @param {Type} type
   * @returns {boolean}
   */
  function type_contains_ident_or_text(type) {
    if (typeof type === "string") {
      if (type === "str" || type === "Text") {
        return true
      }
      if (items_by_name[type] === undefined) {
        throw new Error(`Unknown type: ${type}`)
      }
      return item_contains_ident_or_text(items_by_name[type])
    } else {
      return type.slice(1).some(type_contains_ident_or_text)
    }
  }
}

export { ast_items, items_by_name, needs_lifetime_param }
