import type {
  Type,
  Item,
  EnumItem,
  Tag,
  EnumVariant,
  StructItem,
} from "./astgen_items.ts"
import assert from "node:assert/strict"

export const type_registry: Record<string, Item> = {}

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
 * {@link DStruct}
 */
const StructDef = "StructDef"
/**
 * {@link DFieldDef}
 */
const FieldDef = "FieldDef"
/**
 * {@link DClassMember}
 */
const ClassMember = "ClassMember"
/**
 * {@link DStructMember}
 */
const StructMember = "StructMember"
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

export const DPattern = Enum(Pattern, ["span", "visit"], {
  Var: { ident: Ident },
  Assignment: { pattern: Pattern, initializer: Expr },
  Array: { items: List(Pattern) },
  Object: { properties: List("ObjectPatternProperty"), rest: Option(Pattern) },
  Prop: { expr: Expr, key: ObjectKey },
  Elision: {},
  Rest: { pattern: Pattern },
})
export const DStmt = Enum(Stmt, ["span", "visit"], {
  Expr: { expr: Expr },
  Block: { block: Block },
  Return: { leading_trivia: Text, value: Option(Expr) },
  VarDecl: { decl: VarDecl },
  If: { condition: Expr, if_true: Stmt, if_false: Option(Stmt) },
  Switch: { condition: Expr, cases: List(SwitchCase) },
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
  Func: { func: Func, is_exported: "boolean" },
  ClassDecl: { class_def: Class },
  StructDecl: { struct_def: StructDef },
  Import: {
    default_import: Option(Ident),
    named_imports: List("ImportSpecifier"),
    module_specifier: Text,
  },
  ImportStarAs: {
    as_name: Ident,
    module_specifier: Text,
  },
  Labeled: {
    label: Label,
    stmt: Stmt,
  },
  ObjectTypeDecl: {
    name: Ident,
    fields: List("ObjectTypeDeclField"),
  },
  TypeAlias: {
    name: Ident,
    type_annotation: TypeAnnotation,
  },
  LJSExternFunction: {
    is_exported: "boolean",
    name: Ident,
    params: List("Param"),
    return_type: TypeAnnotation,
  },
  Empty: {},
})
const DObjectTypeDeclField = Struct("ObjectTypeDeclField", [], {
  is_readonly: "boolean",
  label: Ident,
  type_annotation: TypeAnnotation,
})

export const DStructInitItem = Struct("StructInitItem", ["span"], {
  Key: Ident,
  value: Expr,
})

export const DExpr = Enum(Expr, ["span", "visit"], {
  Var: { leading_trivia: Text, ident: Ident },
  Paren: { expr: Expr },
  BinOp: { lhs: Expr, operator: BinOp, rhs: Expr },
  ArrowFn: {
    params: List(Param),
    return_type: Option(TypeAnnotation),
    body: ArrowFnBody,
  },
  Func: { func: Func },
  Call: {
    callee: Expr,
    args: List(Expr),
    spread: Option(Expr),
    is_optional: "boolean",
  },
  StructInit: {
    lhs: Expr,
    fields: List("StructInitItem"),
  },
  Index: { lhs: Expr, property: Expr, is_optional: "boolean" },
  Prop: { lhs: Expr, property: Ident, is_optional: "boolean" },
  String: { text: Text },
  Number: { text: Text },
  Boolean: { value: "boolean" },
  Null: {},
  Undefined: {},
  Object: { entries: List(ObjectLiteralEntry) },
  Throw: { value: Expr },
  PostIncrement: { value: Expr },
  PostDecrement: { value: Expr },
  PreIncrement: { value: Expr },
  PreDecrement: { value: Expr },
  Array: { items: List(ArrayLiteralMember) },
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
  Comma: { items: List(Expr) },
  Super: {},
  Class: { class_def: "Class" },
  TemplateLiteral: { fragments: List(TemplateLiteralFragment) },
  TaggedTemplateLiteral: {
    tag: Expr,
    fragments: List(TemplateLiteralFragment),
  },
  Builtin: {
    text: Text,
  },
  AddressOf: { expr: Expr },
  Deref: { expr: Expr },
})
export const DTypeAnnotation = Enum("TypeAnnotation", ["span"], {
  Ident: { leading_trivia: Text, ident: Ident },
  Union: { left: TypeAnnotation, right: TypeAnnotation },
  Array: { item: TypeAnnotation },
  ReadonlyArray: { item: TypeAnnotation },
  Application: { callee: TypeAnnotation, args: List(TypeAnnotation) },
  String: { text: Text },
  Func: {
    type_params: List("TypeParam"),
    params: List("FuncTypeParam"),
    returns: TypeAnnotation,
  },
  LJSMutPtr: {
    to: TypeAnnotation,
  },
  LJSPtr: {
    to: TypeAnnotation,
  },
  Builtin: {
    text: Text,
  },
  Qualified: {
    head: Ident,
    tail: List(Ident),
  },
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
const DStructDef = Struct("StructDef", ["span"], {
  name: Ident,
  members: List(StructMember),
})
const DClassBody = Struct(ClassBody, ["span"], {
  members: List(ClassMember),
})
const DClassMember = Enum(ClassMember, [], {
  MethodDef: { method: MethodDef },
  FieldDef: { field: FieldDef },
})

const DStructMember = Enum(StructMember, [], {
  FieldDef: { name: Ident, type_annotation: TypeAnnotation },
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

export const DFunc = Struct("Func", ["span", "visit"], {
  name: Option(Ident),
  type_params: List("TypeParam"),
  params: List(Param),
  body: Block,
  return_type: Option(TypeAnnotation),
  is_generator: "boolean",
  is_async: "boolean",
})
const DTypeParam = Struct("TypeParam", [], {
  ident: Ident,
})
const DBlock = Struct("Block", ["span", "visit"], {
  stmts: List(Stmt),
})

const DLabel = Struct("Label", ["span"], {
  name: "str",
})

export const DSourceFile = Struct("SourceFile", ["span", "visit"], {
  path: "str",
  stmts: List(Stmt),
  qualified_name: {
    tags: ["sexpr_ignore"],
    type: "QualifiedName",
  },
  errors: {
    type: List("Diagnostic"),
    tags: ["sexpr_ignore"],
  },
})
const DSwitchCase = Struct("SwitchCase", ["span"], {
  test: Option(Expr),
  body: List(Stmt),
})
const DInOrOf = StringUnion(InOrOf, "In", "Of")
const DVarDecl = Struct("VarDecl", ["span"], {
  decl_type: DeclType,
  declarators: List(VarDeclarator),
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
  DStmt,
  DClass,
  DStructDef,
  DStructMember,
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
  DStructInitItem,
  DObjectTypeDeclField,
  DTypeAnnotation,
  DFuncTypeParam,
  DObjectLiteralEntry,
  DObjectKey,
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
  return register_item({
    kind: "enum",
    name,
    tags: [],
    variants: variants.map((variant) => ({
      name: variant,
      args: {},
      tags: [],
    })),
  })
}
function register_item<I extends Item>(item: I): I {
  if (type_registry[item.name]) {
    throw new Error(`Item with name ${item.name} already exists`)
  }
  type_registry[item.name] = item
  return item
}

function Enum(
  name: string,
  tags: Tag[],
  variants: Record<string, Record<string, Type>>,
): EnumItem {
  for (const args of Object.values(variants)) {
    assert(
      Object.keys(args).every((arg_name) => arg_name !== "kind"),
      `Enum variant "${name}" cannot have a "kind" field because it reserved for the variant tag`,
    )
  }
  return register_item({
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
  })
}

function Struct(
  name: string,
  tags: Tag[],
  fields: Record<string, Type | { type: Type; tags: Tag[] }>,
): StructItem {
  assert(
    Object.keys(fields).every((field_name) => field_name !== "kind"),
    `Struct "${name}" cannot have a "kind" field because it reserved for the struct tag`,
  )
  const fields_with_tags = Object.fromEntries(
    Object.entries(fields).map(([field_name, type]) => {
      if (Array.isArray(type) || typeof type === "string") {
        return [field_name, { type, tags: [] }]
      } else {
        return [field_name, type]
      }
    }),
  )
  return register_item({
    kind: "struct",
    name,
    tags,
    fields: fields_with_tags,
  })
}

function Option<T extends Type>(type: T): ["Option", T] {
  return ["Option", type]
}

function List<T extends Type>(type: T): ["Vec", T] {
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
        return Object.entries(item.fields).some(([_, field]) =>
          type_contains_ident_or_text(field.type),
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
