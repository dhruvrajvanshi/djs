import type {
  Type,
  Item,
  EnumItem,
  Tag,
  EnumVariant,
  StructItem,
} from "./astgen_items.ts"
import { is_item } from "./astgen_items.ts"
import assert from "node:assert/strict"

export const type_registry: Record<string, Item> = {}
const Text = "Text"

const Ident = Struct("Ident", ["span"], {
  text: "str",
})
export const Stmt = Enum("Stmt", ["span", "visit"], {
  Expr: { expr: () => Expr },
  Block: { block: () => Block },
  Return: { leading_trivia: Text, value: Option(() => Expr) },
  VarDecl: { decl: () => VarDecl },
  If: {
    condition: () => Expr,
    if_true: () => Stmt,
    if_false: Option(() => Stmt),
  },
  Switch: { condition: () => Expr, cases: List(() => SwitchCase) },
  While: { condition: () => Expr, body: () => Stmt },
  DoWhile: { body: () => Stmt, condition: () => Expr },
  Try: {
    try_block: () => Block,
    catch_pattern: Option(() => Pattern),
    catch_block: Option(() => Block),
    finally_block: Option(() => Block),
  },
  For: {
    init: () => ForInit,
    test: Option(() => Expr),
    update: Option(() => Expr),
    body: () => Stmt,
  },
  ForInOrOf: {
    decl_type: Option(() => DeclType), // None for `for (x of y) {}`
    lhs: () => Pattern,
    in_or_of: () => InOrOf,
    rhs: () => Expr,
    body: () => Stmt,
  },
  Break: { label: Option(() => Label) },
  Continue: { label: Option(() => Label) },
  Debugger: {},
  With: { expr: () => Expr, body: () => Stmt },
  Func: { func: () => Func, is_exported: "boolean" },
  ClassDecl: { class_def: () => Class },
  StructDecl: { struct_def: () => StructDef },
  UntaggedUnionDecl: { untagged_union_def: () => UntaggedUnion },
  Import: {
    default_import: Option(Ident),
    named_imports: List(() => ImportSpecifier),
    module_specifier: Text,
  },
  ImportStarAs: {
    as_name: Ident,
    module_specifier: Text,
  },
  Labeled: {
    label: () => Label,
    stmt: () => Stmt,
  },
  ObjectTypeDecl: {
    name: Ident,
    fields: List("ObjectTypeDeclField"),
  },
  TypeAlias: {
    name: Ident,
    type_annotation: () => TypeAnnotation,
  },
  LJSExternFunction: {
    is_exported: "boolean",
    name: Ident,
    params: List(() => Param),
    return_type: () => TypeAnnotation,
  },
  LJSExternConst: {
    is_exported: "boolean",
    name: Ident,
    type_annotation: () => TypeAnnotation,
  },
  LJSExternType: {
    is_exported: "boolean",
    name: Ident,
  },
  LJSBuiltinType: {
    is_exported: "boolean",
    name: Ident,
  },
  LJSBuiltinConst: {
    is_exported: "boolean",
    name: Ident,
  },
  Empty: {},
})

export const Expr = Enum("Expr", ["span", "visit"], {
  Var: { leading_trivia: Text, ident: Ident },
  Paren: { expr: () => Expr },
  BinOp: {
    lhs: () => Expr,
    operator: () => BinOp,
    rhs: () => Expr,
  },
  ArrowFn: {
    params: List(() => Param),
    return_type: Option(() => TypeAnnotation),
    body: () => ArrowFnBody,
  },
  Func: { func: () => Func },
  Call: {
    callee: () => Expr,
    args: List(() => Expr),
    spread: Option(() => Expr),
    is_optional: "boolean",
  },
  StructInit: {
    lhs: () => Expr,
    fields: List("StructInitItem"),
  },
  Index: {
    lhs: () => Expr,
    property: () => Expr,
    is_optional: "boolean",
  },
  Prop: { lhs: () => Expr, property: Ident, is_optional: "boolean" },
  String: { text: Text },
  Number: { text: Text },
  Boolean: { value: "boolean" },
  Null: {},
  Undefined: {},
  Object: { entries: List(() => ObjectLiteralEntry) },
  Throw: { value: () => Expr },
  PostIncrement: { value: () => Expr },
  PostDecrement: { value: () => Expr },
  PreIncrement: { value: () => Expr },
  PreDecrement: { value: () => Expr },
  Array: { items: List(() => ArrayLiteralMember) },
  New: { expr: () => Expr },
  Yield: { value: Option(() => Expr) },
  YieldFrom: { expr: () => Expr },
  Ternary: {
    condition: () => Expr,
    if_true: () => Expr,
    if_false: () => Expr,
  },
  Assign: {
    pattern: () => Pattern,
    operator: () => AssignOp,
    value: () => Expr,
  },
  Regex: { text: "Text" },
  Delete: { expr: () => Expr },
  Void: { expr: () => Expr },
  TypeOf: { expr: () => Expr },
  UnaryPlus: { expr: () => Expr },
  UnaryMinus: { expr: () => Expr },
  BitNot: { expr: () => Expr },
  Not: { expr: () => Expr },
  Await: { expr: () => Expr },
  Comma: { items: List(() => Expr) },
  Super: {},
  Class: { class_def: () => Class },
  TemplateLiteral: { fragments: List(() => TemplateLiteralFragment) },
  TaggedTemplateLiteral: {
    tag: () => Expr,
    fragments: List(() => TemplateLiteralFragment),
  },
  AddressOf: { expr: () => Expr, mut: "boolean" },
  Deref: { expr: () => Expr },
  TypeApplication: {
    expr: () => Expr,
    type_args: List(() => TypeAnnotation),
  },
})
export const TypeAnnotation = Enum("TypeAnnotation", ["span"], {
  Ident: { leading_trivia: Text, ident: Ident },
  Union: {
    left: () => TypeAnnotation,
    right: () => TypeAnnotation,
  },
  Array: { item: () => TypeAnnotation },
  ReadonlyArray: { item: () => TypeAnnotation },
  FixedSizeArray: { item: () => TypeAnnotation, size: () => Expr },
  Application: {
    callee: () => TypeAnnotation,
    args: List(() => TypeAnnotation),
  },
  String: { text: Text },
  Func: {
    type_params: List(() => TypeParam),
    params: List(() => FuncTypeParam),
    returns: () => TypeAnnotation,
  },
  LJSMutPtr: {
    to: () => TypeAnnotation,
  },
  LJSPtr: {
    to: () => TypeAnnotation,
  },
  Qualified: {
    head: Ident,
    tail: List(Ident),
  },
})

export const Pattern = Enum("Pattern", ["span", "visit"], {
  Var: { ident: Ident },
  Assignment: { pattern: () => Pattern, initializer: () => Expr },
  Array: { items: List(() => Pattern) },
  Object: {
    properties: List(() => ObjectPatternProperty),
    rest: Option(() => Pattern),
  },
  Prop: { expr: () => Expr, key: () => ObjectKey },
  Deref: { expr: () => Expr },
  Elision: {},
  Rest: { pattern: () => Pattern },
})

const ObjectTypeDeclField = Struct("ObjectTypeDeclField", [], {
  is_readonly: "boolean",
  label: Ident,
  type_annotation: () => TypeAnnotation,
})

export const StructInitItem = Struct("StructInitItem", ["span"], {
  Key: Ident,
  value: () => Expr,
})

const FuncTypeParam = Struct("FuncTypeParam", [], {
  label: Ident,
  type_annotation: () => TypeAnnotation,
})
const Class = Struct("Class", ["span"], {
  name: Option(Ident),
  superclass: Option(() => Expr),
  body: () => ClassBody,
})
const StructDef = Struct("StructDef", ["span"], {
  name: Ident,
  members: List(() => StructMember),
})
const ClassBody = Struct("ClassBody", ["span"], {
  members: List(() => ClassMember),
})
const ClassMember = Enum("ClassMember", [], {
  MethodDef: { method: () => MethodDef },
  FieldDef: { field: () => FieldDef },
})

const StructMember = Enum("StructMember", [], {
  FieldDef: { name: Ident, type_annotation: () => TypeAnnotation },
})
const UntaggedUnionMember = Enum("UntaggedUnionMember", [], {
  VariantDef: { name: Ident, type_annotation: () => TypeAnnotation },
})
const UntaggedUnion = Struct("UntaggedUnion", ["span"], {
  name: Ident,
  members: List(() => UntaggedUnionMember),
})

const FieldDef = Struct("FieldDef", ["span"], {
  name: Ident,
  initializer: Option(() => Expr),
})
const MethodDef = Struct("MethodDef", ["span"], {
  name: () => ObjectKey,
  body: () => Func,
  return_type: Option(() => TypeAnnotation),
  accessor_type: Option(() => AccessorType),
})

const ObjectKey = Enum("ObjectKey", ["span"], {
  Ident: { ident: Ident },
  String: { text: Text },
  Computed: { expr: () => Expr },
})

const ObjectLiteralEntry = Enum("ObjectLiteralEntry", ["span"], {
  Ident: { ident: Ident },
  Prop: { key: ObjectKey, value: () => Expr },
  Method: { method: MethodDef },
  Spread: { expr: () => Expr },
})

const Param = Struct("Param", ["span"], {
  pattern: Pattern,
  type_annotation: Option(() => TypeAnnotation),
  initializer: Option(() => Expr),
})

const ArrayLiteralMember = Enum("ArrayLiteralMember", ["span"], {
  Expr: { expr: () => Expr },
  Elision: {},
  Spread: { expr: () => Expr },
})

export const Func = Struct("Func", ["span", "visit"], {
  name: Option(Ident),
  type_params: List("TypeParam"),
  params: List(Param),
  body: () => Block,
  return_type: Option(() => TypeAnnotation),
  is_generator: "boolean",
  is_async: "boolean",
})
const TypeParam = Struct("TypeParam", [], {
  ident: Ident,
})
const Block = Struct("Block", ["span", "visit"], {
  stmts: List(() => Stmt),
})

const Label = Struct("Label", ["span"], {
  name: "str",
})

export const SourceFile = Struct("SourceFile", ["span", "visit"], {
  path: "str",
  stmts: List(() => Stmt),
  qualified_name: {
    tags: ["sexpr_ignore"],
    type: "QualifiedName",
  },
  errors: {
    type: List("Diagnostic"),
    tags: ["sexpr_ignore"],
  },
})
const SwitchCase = Struct("SwitchCase", ["span"], {
  test: Option(() => Expr),
  body: List(() => Stmt),
})
const InOrOf = StringUnion("InOrOf", "In", "Of")
const VarDecl = Struct("VarDecl", ["span"], {
  decl_type: () => DeclType,
  declarators: List(() => VarDeclarator),
})
const VarDeclarator = Struct("VarDeclarator", [], {
  pattern: Pattern,
  type_annotation: Option(() => TypeAnnotation),
  init: Option(() => Expr),
})
const ForInit = Enum("ForInit", [], {
  VarDecl: { decl: () => VarDecl },
  Expr: { expr: () => Expr },
})
const ArrowFnBody = Enum("ArrowFnBody", ["span"], {
  Expr: { expr: () => Expr },
  Block: { block: () => Block },
})
const TemplateLiteralFragment = Enum("TemplateLiteralFragment", ["span"], {
  Text: { text: Text },
  Expr: { expr: () => Expr },
})
const ObjectPatternProperty = Struct("ObjectPatternProperty", ["span"], {
  key: ObjectKey,
  value: Pattern,
})
const ModuleExportName = Enum("ModuleExportName", [], {
  Ident: { ident: Ident },
  String: { text: Text },
})
const ImportSpecifier = Struct("ImportSpecifier", ["span"], {
  type_only: "boolean",
  as_name: Option(Ident),
  imported_name: () => ModuleExportName,
})
const BinOp = StringUnion(
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
const AssignOp = StringUnion(
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
const DeclType = StringUnion("DeclType", "Let", "Const", "Var")
const AccessorType = StringUnion("AccessorType", "Get", "Set")

const ast_items = [
  SourceFile,
  Stmt,
  Class,
  StructDef,
  StructMember,
  UntaggedUnion,
  UntaggedUnionMember,
  Block,
  ClassBody,
  MethodDef,
  ClassMember,
  FieldDef,
  Ident,
  Pattern,
  Label,
  SwitchCase,
  InOrOf,
  VarDecl,
  VarDeclarator,
  ForInit,
  Expr,
  StructInitItem,
  ObjectTypeDeclField,
  TypeAnnotation,
  FuncTypeParam,
  ObjectLiteralEntry,
  ObjectKey,
  Param,
  Func,
  TypeParam,
  ArrayLiteralMember,
  ArrowFnBody,
  TemplateLiteralFragment,
  ObjectPatternProperty,
  ModuleExportName,
  ImportSpecifier,
  BinOp,
  AssignOp,
  DeclType,
  AccessorType,
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
    Object.entries(fields).map(([field_name, field_value]) => {
      if (
        Array.isArray(field_value) ||
        typeof field_value === "string" ||
        typeof field_value === "function" ||
        is_item_or_field_def(field_value)
      ) {
        return [field_name, { type: field_value, tags: [] }]
      } else {
        return [field_name, field_value]
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
    } else if (typeof type === "function") {
      return type_contains_ident_or_text(type())
    } else if (is_item(type)) {
      return item_contains_ident_or_text(type)
    } else {
      return type.slice(1).some(type_contains_ident_or_text)
    }
  }
}

function is_item_or_field_def(
  field_value: Type | { type: Type; tags: Tag[] },
): field_value is Item {
  return (
    typeof field_value === "object" &&
    field_value !== null &&
    !Array.isArray(field_value) &&
    "name" in field_value &&
    "kind" in field_value
  )
}

export { ast_items, items_by_name, needs_lifetime_param }
