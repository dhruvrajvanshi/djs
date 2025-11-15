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
const Text = "Text"

const DIdent = Struct("Ident", ["span"], {
  text: "str",
})

export const DPattern = Enum("Pattern", ["span", "visit"], {
  Var: { ident: "Ident" },
  Assignment: { pattern: Lazy(() => DPattern), initializer: Lazy(() => DExpr) },
  Array: { items: List(Lazy(() => DPattern)) },
  Object: {
    properties: List(Lazy(() => DObjectPatternProperty)),
    rest: Option(Lazy(() => DPattern)),
  },
  Prop: { expr: Lazy(() => DExpr), key: Lazy(() => DObjectKey) },
  Deref: { expr: Lazy(() => DExpr) },
  Elision: {},
  Rest: { pattern: Lazy(() => DPattern) },
})
export const DStmt = Enum("Stmt", ["span", "visit"], {
  Expr: { expr: Lazy(() => DExpr) },
  Block: { block: Lazy(() => DBlock) },
  Return: { leading_trivia: Text, value: Option(Lazy(() => DExpr)) },
  VarDecl: { decl: Lazy(() => DVarDecl) },
  If: {
    condition: Lazy(() => DExpr),
    if_true: Lazy(() => DStmt),
    if_false: Option(Lazy(() => DStmt)),
  },
  Switch: { condition: Lazy(() => DExpr), cases: List(Lazy(() => DSwitchCase)) },
  While: { condition: Lazy(() => DExpr), body: Lazy(() => DStmt) },
  DoWhile: { body: Lazy(() => DStmt), condition: Lazy(() => DExpr) },
  Try: {
    try_block: Lazy(() => DBlock),
    catch_pattern: Option(DPattern.name),
    catch_block: Option(Lazy(() => DBlock)),
    finally_block: Option(Lazy(() => DBlock)),
  },
  For: {
    init: Lazy(() => DForInit),
    test: Option(Lazy(() => DExpr)),
    update: Option(Lazy(() => DExpr)),
    body: Lazy(() => DStmt),
  },
  ForInOrOf: {
    decl_type: Option(Lazy(() => DDeclType)), // None for `for (x of y) {}`
    lhs: DPattern.name,
    in_or_of: Lazy(() => DInOrOf),
    rhs: Lazy(() => DExpr),
    body: Lazy(() => DStmt),
  },
  Break: { label: Option(Lazy(() => DLabel)) },
  Continue: { label: Option(Lazy(() => DLabel)) },
  Debugger: {},
  With: { expr: Lazy(() => DExpr), body: Lazy(() => DStmt) },
  Func: { func: Lazy(() => DFunc), is_exported: "boolean" },
  ClassDecl: { class_def: Lazy(() => DClass) },
  StructDecl: { struct_def: Lazy(() => DStructDef) },
  UntaggedUnionDecl: { untagged_union_def: Lazy(() => DUntaggedUnion) },
  Import: {
    default_import: Option("Ident"),
    named_imports: List(Lazy(() => DImportSpecifier)),
    module_specifier: Text,
  },
  ImportStarAs: {
    as_name: "Ident",
    module_specifier: Text,
  },
  Labeled: {
    label: Lazy(() => DLabel),
    stmt: Lazy(() => DStmt),
  },
  ObjectTypeDecl: {
    name: "Ident",
    fields: List("ObjectTypeDeclField"),
  },
  TypeAlias: {
    name: "Ident",
    type_annotation: Lazy(() => DTypeAnnotation),
  },
  LJSExternFunction: {
    is_exported: "boolean",
    name: "Ident",
    params: List(Lazy(() => DParam)),
    return_type: Lazy(() => DTypeAnnotation),
  },
  LJSExternConst: {
    is_exported: "boolean",
    name: "Ident",
    type_annotation: Lazy(() => DTypeAnnotation),
  },
  LJSExternType: {
    is_exported: "boolean",
    name: "Ident",
  },
  Empty: {},
})
const DObjectTypeDeclField = Struct("ObjectTypeDeclField", [], {
  is_readonly: "boolean",
  label: "Ident",
  type_annotation: Lazy(() => DTypeAnnotation),
})

export const DStructInitItem = Struct("StructInitItem", ["span"], {
  Key: "Ident",
  value: Lazy(() => DExpr),
})

export const DExpr = Enum("Expr", ["span", "visit"], {
  Var: { leading_trivia: Text, ident: "Ident" },
  Paren: { expr: Lazy(() => DExpr) },
  BinOp: { lhs: Lazy(() => DExpr), operator: Lazy(() => DBinOp), rhs: Lazy(() => DExpr) },
  ArrowFn: {
    params: List(Lazy(() => DParam)),
    return_type: Option(Lazy(() => DTypeAnnotation)),
    body: Lazy(() => DArrowFnBody),
  },
  Func: { func: Lazy(() => DFunc) },
  Call: {
    callee: Lazy(() => DExpr),
    args: List(Lazy(() => DExpr)),
    spread: Option(Lazy(() => DExpr)),
    is_optional: "boolean",
  },
  StructInit: {
    lhs: Lazy(() => DExpr),
    fields: List("StructInitItem"),
  },
  Index: {
    lhs: Lazy(() => DExpr),
    property: Lazy(() => DExpr),
    is_optional: "boolean",
  },
  Prop: { lhs: Lazy(() => DExpr), property: "Ident", is_optional: "boolean" },
  String: { text: Text },
  Number: { text: Text },
  Boolean: { value: "boolean" },
  Null: {},
  Undefined: {},
  Object: { entries: List(Lazy(() => DObjectLiteralEntry)) },
  Throw: { value: Lazy(() => DExpr) },
  PostIncrement: { value: Lazy(() => DExpr) },
  PostDecrement: { value: Lazy(() => DExpr) },
  PreIncrement: { value: Lazy(() => DExpr) },
  PreDecrement: { value: Lazy(() => DExpr) },
  Array: { items: List(Lazy(() => DArrayLiteralMember)) },
  New: { expr: Lazy(() => DExpr) },
  Yield: { value: Option(Lazy(() => DExpr)) },
  YieldFrom: { expr: Lazy(() => DExpr) },
  Ternary: {
    condition: Lazy(() => DExpr),
    if_true: Lazy(() => DExpr),
    if_false: Lazy(() => DExpr),
  },
  Assign: {
    pattern: DPattern.name,
    operator: Lazy(() => DAssignOp),
    value: Lazy(() => DExpr),
  },
  Regex: { text: "Text" },
  Delete: { expr: Lazy(() => DExpr) },
  Void: { expr: Lazy(() => DExpr) },
  TypeOf: { expr: Lazy(() => DExpr) },
  UnaryPlus: { expr: Lazy(() => DExpr) },
  UnaryMinus: { expr: Lazy(() => DExpr) },
  BitNot: { expr: Lazy(() => DExpr) },
  Not: { expr: Lazy(() => DExpr) },
  Await: { expr: Lazy(() => DExpr) },
  Comma: { items: List(Lazy(() => DExpr)) },
  Super: {},
  Class: { class_def: Lazy(() => DClass) },
  TemplateLiteral: { fragments: List(Lazy(() => DTemplateLiteralFragment)) },
  TaggedTemplateLiteral: {
    tag: Lazy(() => DExpr),
    fragments: List(Lazy(() => DTemplateLiteralFragment)),
  },
  Builtin: {
    text: Text,
  },
  AddressOf: { expr: Lazy(() => DExpr), mut: "boolean" },
  Deref: { expr: Lazy(() => DExpr) },
})
export const DTypeAnnotation = Enum("TypeAnnotation", ["span"], {
  Ident: { leading_trivia: Text, ident: "Ident" },
  Union: {
    left: Lazy(() => DTypeAnnotation),
    right: Lazy(() => DTypeAnnotation),
  },
  Array: { item: Lazy(() => DTypeAnnotation) },
  ReadonlyArray: { item: Lazy(() => DTypeAnnotation) },
  Application: {
    callee: Lazy(() => DTypeAnnotation),
    args: List(Lazy(() => DTypeAnnotation)),
  },
  String: { text: Text },
  Func: {
    type_params: List(Lazy(() => DTypeParam)),
    params: List(Lazy(() => DFuncTypeParam)),
    returns: Lazy(() => DTypeAnnotation),
  },
  LJSMutPtr: {
    to: Lazy(() => DTypeAnnotation),
  },
  LJSPtr: {
    to: Lazy(() => DTypeAnnotation),
  },
  Builtin: {
    text: Text,
  },
  Qualified: {
    head: "Ident",
    tail: List("Ident"),
  },
})

const DFuncTypeParam = Struct("FuncTypeParam", [], {
  label: "Ident",
  type_annotation: Lazy(() => DTypeAnnotation),
})
const DClass = Struct("Class", ["span"], {
  name: Option("Ident"),
  superclass: Option(Lazy(() => DExpr)),
  body: Lazy(() => DClassBody),
})
const DStructDef = Struct("StructDef", ["span"], {
  name: "Ident",
  members: List(Lazy(() => DStructMember)),
})
const DClassBody = Struct("ClassBody", ["span"], {
  members: List(Lazy(() => DClassMember)),
})
const DClassMember = Enum("ClassMember", [], {
  MethodDef: { method: Lazy(() => DMethodDef) },
  FieldDef: { field: Lazy(() => DFieldDef) },
})

const DStructMember = Enum("StructMember", [], {
  FieldDef: { name: "Ident", type_annotation: Lazy(() => DTypeAnnotation) },
})
const DUntaggedUnionMember = Enum("UntaggedUnionMember", [], {
  VariantDef: { name: "Ident", type_annotation: Lazy(() => DTypeAnnotation) },
})
const DUntaggedUnion = Struct("UntaggedUnion", ["span"], {
  name: "Ident",
  members: List(Lazy(() => DUntaggedUnionMember)),
})

const DFieldDef = Struct("FieldDef", ["span"], {
  name: "Ident",
  initializer: Option(Lazy(() => DExpr)),
})
const DMethodDef = Struct("MethodDef", ["span"], {
  name: Lazy(() => DObjectKey),
  body: Lazy(() => DFunc),
  return_type: Option(Lazy(() => DTypeAnnotation)),
  accessor_type: Option(Lazy(() => DAccessorType)),
})

const DObjectKey = Enum("ObjectKey", ["span"], {
  Ident: { ident: "Ident" },
  String: { text: Text },
  Computed: { expr: Lazy(() => DExpr) },
})

const DObjectLiteralEntry = Enum("ObjectLiteralEntry", ["span"], {
  Ident: { ident: "Ident" },
  Prop: { key: DObjectKey.name, value: Lazy(() => DExpr) },
  Method: { method: DMethodDef.name },
  Spread: { expr: Lazy(() => DExpr) },
})

const DParam = Struct("Param", ["span"], {
  pattern: DPattern.name,
  type_annotation: Option(Lazy(() => DTypeAnnotation)),
  initializer: Option(Lazy(() => DExpr)),
})

const DArrayLiteralMember = Enum("ArrayLiteralMember", ["span"], {
  Expr: { expr: Lazy(() => DExpr) },
  Elision: {},
  Spread: { expr: Lazy(() => DExpr) },
})

export const DFunc = Struct("Func", ["span", "visit"], {
  name: Option("Ident"),
  type_params: List("TypeParam"),
  params: List(DParam.name),
  body: Lazy(() => DBlock),
  return_type: Option(Lazy(() => DTypeAnnotation)),
  is_generator: "boolean",
  is_async: "boolean",
})
const DTypeParam = Struct("TypeParam", [], {
  ident: "Ident",
})
const DBlock = Struct("Block", ["span", "visit"], {
  stmts: List(Lazy(() => DStmt)),
})

const DLabel = Struct("Label", ["span"], {
  name: "str",
})

export const DSourceFile = Struct("SourceFile", ["span", "visit"], {
  path: "str",
  stmts: List(Lazy(() => DStmt)),
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
  test: Option(Lazy(() => DExpr)),
  body: List(Lazy(() => DStmt)),
})
const DInOrOf = StringUnion("InOrOf", "In", "Of")
const DVarDecl = Struct("VarDecl", ["span"], {
  decl_type: Lazy(() => DDeclType),
  declarators: List(Lazy(() => DVarDeclarator)),
})
const DVarDeclarator = Struct("VarDeclarator", [], {
  pattern: DPattern.name,
  type_annotation: Option(Lazy(() => DTypeAnnotation)),
  init: Option(Lazy(() => DExpr)),
})
const DForInit = Enum("ForInit", [], {
  VarDecl: { decl: Lazy(() => DVarDecl) },
  Expr: { expr: Lazy(() => DExpr) },
})
const DArrowFnBody = Enum("ArrowFnBody", ["span"], {
  Expr: { expr: Lazy(() => DExpr) },
  Block: { block: Lazy(() => DBlock) },
})
const DTemplateLiteralFragment = Enum("TemplateLiteralFragment", ["span"], {
  Text: { text: Text },
  Expr: { expr: Lazy(() => DExpr) },
})
const DObjectPatternProperty = Struct("ObjectPatternProperty", ["span"], {
  key: DObjectKey.name,
  value: DPattern.name,
})
const DModuleExportName = Enum("ModuleExportName", [], {
  Ident: { ident: "Ident" },
  String: { text: Text },
})
const DImportSpecifier = Struct("ImportSpecifier", ["span"], {
  type_only: "boolean",
  as_name: Option("Ident"),
  imported_name: Lazy(() => DModuleExportName),
})
const DBinOp = StringUnion(
  "BinOp",
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
  "AssignOp",
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
const DDeclType = StringUnion("DeclType", "Let", "Const", "Var")
const DAccessorType = StringUnion("AccessorType", "Get", "Set")

const ast_items = [
  DSourceFile,
  DStmt,
  DClass,
  DStructDef,
  DStructMember,
  DUntaggedUnion,
  DUntaggedUnionMember,
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
      if (
        Array.isArray(type) ||
        typeof type === "string" ||
        typeof type === "function"
      ) {
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

function Lazy(getItem: () => Item): () => string {
  return () => getItem().name
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
    } else if (typeof type === "function") {
      // Handle lazy type by resolving it and recursing
      return type_contains_ident_or_text(type())
    } else {
      return type.slice(1).some(type_contains_ident_or_text)
    }
  }
}

export { ast_items, items_by_name, needs_lifetime_param }
