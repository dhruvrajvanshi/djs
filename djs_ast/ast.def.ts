import type {
  Type,
  Item,
  EnumItem,
  Tag,
  EnumVariant,
  StructItem,
} from "./astgen_items"

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

/**
 * {@link DLJSExternFunction}
 */
const LJSExternFunction = "LJSExternFunction"

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
  Import: {
    default_import: Option(Ident),
    named_imports: Array("ImportSpecifier"),
    module_specifier: Text,
  },
  Labeled: {
    label: Label,
    stmt: Stmt,
  },
  ObjectTypeDecl: {
    name: Ident,
    fields: Array("ObjectTypeDeclField"),
  },
  TypeAlias: {
    name: Ident,
    type_annotation: TypeAnnotation,
  },
  LJSExternFunction: {
    func: LJSExternFunction,
  },
  Empty: {},
})
const DObjectTypeDeclField = Struct("ObjectTypeDeclField", [], {
  is_readonly: "boolean",
  label: Ident,
  type_annotation: TypeAnnotation,
})

const DExpr = Enum(Expr, ["span", "visit"], {
  Var: { ident: Ident },
  Paren: { expr: Expr },
  BinOp: { lhs: Expr, operator: BinOp, rhs: Expr },
  ArrowFn: {
    params: ParamList,
    return_type: Option(TypeAnnotation),
    body: ArrowFnBody,
  },
  Func: { func: Func },
  Call: {
    callee: Expr,
    args: Array(Expr),
    spread: Option(Expr),
    is_optional: "boolean",
  },
  Index: { lhs: Expr, property: Expr, is_optional: "boolean" },
  Prop: { lhs: Expr, property: Ident, is_optional: "boolean" },
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
  TaggedTemplateLiteral: {
    tag: Expr,
    fragments: Array(TemplateLiteralFragment),
  },
})
const DTypeAnnotation = Enum("TypeAnnotation", ["span"], {
  Ident: { ident: Ident },
  Union: { left: TypeAnnotation, right: TypeAnnotation },
  Array: { item: TypeAnnotation },
  ReadonlyArray: { item: TypeAnnotation },
  Application: { callee: TypeAnnotation, args: Array(TypeAnnotation) },
  String: { text: Text },
  Func: {
    type_params: Array("TypeParam"),
    params: Array("FuncTypeParam"),
    returns: TypeAnnotation,
  },
  LJSConstPtr: {
    to: TypeAnnotation,
  },
  LJSPtr: {
    to: TypeAnnotation,
  },
})
const DLJSExternFunction = Struct("LJSExternFunction", ["span"], {
  name: Ident,
  params: Array("Param"),
  return_type: TypeAnnotation,
})

const DFuncTypeParam = Struct("FuncTypeParam", [], {
  label: Ident,
  type_annotation: TypeAnnotation,
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
  initializer: Option(Expr),
})

const DArrayLiteralMember = Enum(ArrayLiteralMember, ["span"], {
  Expr: { expr: Expr },
  Elision: {},
  Spread: { expr: Expr },
})

const DFunc = Struct("Func", ["span"], {
  name: Option(Ident),
  type_params: Array("TypeParam"),
  params: ParamList,
  body: Block,
  return_type: Option(TypeAnnotation),
  is_generator: "boolean",
  is_async: "boolean",
})
const DTypeParam = Struct("TypeParam", [], {
  ident: Ident,
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
  type_annotation: Option(TypeAnnotation),
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
const DModuleExportName = Enum("ModuleExportName", [], {
  Ident: { ident: Ident },
  String: { text: Text },
})
const DImportSpecifier = Struct("ImportSpecifier", ["span"], {
  type_only: "boolean",
  as_name: Option(Ident),
  imported_name: "ModuleExportName",
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
  // Exponent
  "Exponent",
  // Bitwise
  "BitXor",
  "BitAnd",
  "BitOr",
  // Logical
  "And",
  "Or",
  "Coalesce",
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
  DObjectTypeDeclField,
  DTypeAnnotation,
  DLJSExternFunction,
  DFuncTypeParam,
  DObjectLiteralEntry,
  DObjectKey,
  DParamList,
  DParam,
  DFunc,
  DTypeParam,
  DArrayLiteralMember,
  DArrowFnBody,
  DTemplateLiteralFragment,
  DObjectPatternProperty,
  DModuleExportName,
  DImportSpecifier,
  DBinOp,
  DAssignOp,
  DDeclType,
  DAccessorType,
]

function StringUnion(name: string, ...variants: readonly string[]): EnumItem {
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

function Enum(
  name: string,
  tags: Tag[],
  variants: Record<string, Record<string, Type>>,
): EnumItem {
  return {
    kind: "enum",
    name,
    tags,
    variants: Object.entries(variants).map(([name, args]): EnumVariant => {
      return {
        name,
        tags: [],
        args,
      }
    }),
  }
}

function Struct(
  name: string,
  tags: Tag[],
  fields: Record<string, Type>,
): StructItem {
  return {
    kind: "struct",
    name,
    tags,
    fields,
  }
}

function Option<T extends Type>(type: T): ["Option", T] {
  return ["Option", type]
}

function Array<T extends Type>(type: T): ["Vec", T] {
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

  function item_contains_ident_or_text(item: Item): boolean {
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

  function type_contains_ident_or_text(type: Type): boolean {
    if (typeof type === "string") {
      if (type === "str" || type === "Text") {
        return true
      }
      if (type === "boolean") {
        return false
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
