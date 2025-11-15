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

const Ident = Struct("Ident", ["span"], {
  text: "str",
})

export const Pattern = Enum("Pattern", ["span", "visit"], {
  Var: { ident: Ident.name },
  Assignment: { pattern: Lazy(() => Pattern), initializer: Lazy(() => Expr) },
  Array: { items: List(Lazy(() => Pattern)) },
  Object: {
    properties: List(Lazy(() => ObjectPatternProperty)),
    rest: Option(Lazy(() => Pattern)),
  },
  Prop: { expr: Lazy(() => Expr), key: Lazy(() => ObjectKey) },
  Deref: { expr: Lazy(() => Expr) },
  Elision: {},
  Rest: { pattern: Lazy(() => Pattern) },
})
export const Stmt = Enum("Stmt", ["span", "visit"], {
  Expr: { expr: Lazy(() => Expr) },
  Block: { block: Lazy(() => Block) },
  Return: { leading_trivia: Text, value: Option(Lazy(() => Expr)) },
  VarDecl: { decl: Lazy(() => VarDecl) },
  If: {
    condition: Lazy(() => Expr),
    if_true: Lazy(() => Stmt),
    if_false: Option(Lazy(() => Stmt)),
  },
  Switch: { condition: Lazy(() => Expr), cases: List(Lazy(() => SwitchCase)) },
  While: { condition: Lazy(() => Expr), body: Lazy(() => Stmt) },
  DoWhile: { body: Lazy(() => Stmt), condition: Lazy(() => Expr) },
  Try: {
    try_block: Lazy(() => Block),
    catch_pattern: Option(Pattern.name),
    catch_block: Option(Lazy(() => Block)),
    finally_block: Option(Lazy(() => Block)),
  },
  For: {
    init: Lazy(() => ForInit),
    test: Option(Lazy(() => Expr)),
    update: Option(Lazy(() => Expr)),
    body: Lazy(() => Stmt),
  },
  ForInOrOf: {
    decl_type: Option(Lazy(() => DeclType)), // None for `for (x of y) {}`
    lhs: Pattern.name,
    in_or_of: Lazy(() => InOrOf),
    rhs: Lazy(() => Expr),
    body: Lazy(() => Stmt),
  },
  Break: { label: Option(Lazy(() => Label)) },
  Continue: { label: Option(Lazy(() => Label)) },
  Debugger: {},
  With: { expr: Lazy(() => Expr), body: Lazy(() => Stmt) },
  Func: { func: Lazy(() => Func), is_exported: "boolean" },
  ClassDecl: { class_def: Lazy(() => Class) },
  StructDecl: { struct_def: Lazy(() => StructDef) },
  UntaggedUnionDecl: { untagged_union_def: Lazy(() => UntaggedUnion) },
  Import: {
    default_import: Option(Ident.name),
    named_imports: List(Lazy(() => ImportSpecifier)),
    module_specifier: Text,
  },
  ImportStarAs: {
    as_name: Ident.name,
    module_specifier: Text,
  },
  Labeled: {
    label: Lazy(() => Label),
    stmt: Lazy(() => Stmt),
  },
  ObjectTypeDecl: {
    name: Ident.name,
    fields: List("ObjectTypeDeclField"),
  },
  TypeAlias: {
    name: Ident.name,
    type_annotation: Lazy(() => TypeAnnotation),
  },
  LJSExternFunction: {
    is_exported: "boolean",
    name: Ident.name,
    params: List(Lazy(() => Param)),
    return_type: Lazy(() => TypeAnnotation),
  },
  LJSExternConst: {
    is_exported: "boolean",
    name: Ident.name,
    type_annotation: Lazy(() => TypeAnnotation),
  },
  LJSExternType: {
    is_exported: "boolean",
    name: Ident.name,
  },
  Empty: {},
})
const ObjectTypeDeclField = Struct("ObjectTypeDeclField", [], {
  is_readonly: "boolean",
  label: Ident.name,
  type_annotation: Lazy(() => TypeAnnotation),
})

export const StructInitItem = Struct("StructInitItem", ["span"], {
  Key: Ident.name,
  value: Lazy(() => Expr),
})

export const Expr = Enum("Expr", ["span", "visit"], {
  Var: { leading_trivia: Text, ident: Ident.name },
  Paren: { expr: Lazy(() => Expr) },
  BinOp: {
    lhs: Lazy(() => Expr),
    operator: Lazy(() => BinOp),
    rhs: Lazy(() => Expr),
  },
  ArrowFn: {
    params: List(Lazy(() => Param)),
    return_type: Option(Lazy(() => TypeAnnotation)),
    body: Lazy(() => ArrowFnBody),
  },
  Func: { func: Lazy(() => Func) },
  Call: {
    callee: Lazy(() => Expr),
    args: List(Lazy(() => Expr)),
    spread: Option(Lazy(() => Expr)),
    is_optional: "boolean",
  },
  StructInit: {
    lhs: Lazy(() => Expr),
    fields: List("StructInitItem"),
  },
  Index: {
    lhs: Lazy(() => Expr),
    property: Lazy(() => Expr),
    is_optional: "boolean",
  },
  Prop: { lhs: Lazy(() => Expr), property: Ident.name, is_optional: "boolean" },
  String: { text: Text },
  Number: { text: Text },
  Boolean: { value: "boolean" },
  Null: {},
  Undefined: {},
  Object: { entries: List(Lazy(() => ObjectLiteralEntry)) },
  Throw: { value: Lazy(() => Expr) },
  PostIncrement: { value: Lazy(() => Expr) },
  PostDecrement: { value: Lazy(() => Expr) },
  PreIncrement: { value: Lazy(() => Expr) },
  PreDecrement: { value: Lazy(() => Expr) },
  Array: { items: List(Lazy(() => ArrayLiteralMember)) },
  New: { expr: Lazy(() => Expr) },
  Yield: { value: Option(Lazy(() => Expr)) },
  YieldFrom: { expr: Lazy(() => Expr) },
  Ternary: {
    condition: Lazy(() => Expr),
    if_true: Lazy(() => Expr),
    if_false: Lazy(() => Expr),
  },
  Assign: {
    pattern: Pattern.name,
    operator: Lazy(() => AssignOp),
    value: Lazy(() => Expr),
  },
  Regex: { text: "Text" },
  Delete: { expr: Lazy(() => Expr) },
  Void: { expr: Lazy(() => Expr) },
  TypeOf: { expr: Lazy(() => Expr) },
  UnaryPlus: { expr: Lazy(() => Expr) },
  UnaryMinus: { expr: Lazy(() => Expr) },
  BitNot: { expr: Lazy(() => Expr) },
  Not: { expr: Lazy(() => Expr) },
  Await: { expr: Lazy(() => Expr) },
  Comma: { items: List(Lazy(() => Expr)) },
  Super: {},
  Class: { class_def: Lazy(() => Class) },
  TemplateLiteral: { fragments: List(Lazy(() => TemplateLiteralFragment)) },
  TaggedTemplateLiteral: {
    tag: Lazy(() => Expr),
    fragments: List(Lazy(() => TemplateLiteralFragment)),
  },
  Builtin: {
    text: Text,
  },
  AddressOf: { expr: Lazy(() => Expr), mut: "boolean" },
  Deref: { expr: Lazy(() => Expr) },
})
export const TypeAnnotation = Enum("TypeAnnotation", ["span"], {
  Ident: { leading_trivia: Text, ident: Ident.name },
  Union: {
    left: Lazy(() => TypeAnnotation),
    right: Lazy(() => TypeAnnotation),
  },
  Array: { item: Lazy(() => TypeAnnotation) },
  ReadonlyArray: { item: Lazy(() => TypeAnnotation) },
  Application: {
    callee: Lazy(() => TypeAnnotation),
    args: List(Lazy(() => TypeAnnotation)),
  },
  String: { text: Text },
  Func: {
    type_params: List(Lazy(() => TypeParam)),
    params: List(Lazy(() => FuncTypeParam)),
    returns: Lazy(() => TypeAnnotation),
  },
  LJSMutPtr: {
    to: Lazy(() => TypeAnnotation),
  },
  LJSPtr: {
    to: Lazy(() => TypeAnnotation),
  },
  Builtin: {
    text: Text,
  },
  Qualified: {
    head: Ident.name,
    tail: List(Ident.name),
  },
})

const FuncTypeParam = Struct("FuncTypeParam", [], {
  label: Ident.name,
  type_annotation: Lazy(() => TypeAnnotation),
})
const Class = Struct("Class", ["span"], {
  name: Option(Ident.name),
  superclass: Option(Lazy(() => Expr)),
  body: Lazy(() => ClassBody),
})
const StructDef = Struct("StructDef", ["span"], {
  name: Ident.name,
  members: List(Lazy(() => StructMember)),
})
const ClassBody = Struct("ClassBody", ["span"], {
  members: List(Lazy(() => ClassMember)),
})
const ClassMember = Enum("ClassMember", [], {
  MethodDef: { method: Lazy(() => MethodDef) },
  FieldDef: { field: Lazy(() => FieldDef) },
})

const StructMember = Enum("StructMember", [], {
  FieldDef: { name: Ident.name, type_annotation: Lazy(() => TypeAnnotation) },
})
const UntaggedUnionMember = Enum("UntaggedUnionMember", [], {
  VariantDef: { name: Ident.name, type_annotation: Lazy(() => TypeAnnotation) },
})
const UntaggedUnion = Struct("UntaggedUnion", ["span"], {
  name: Ident.name,
  members: List(Lazy(() => UntaggedUnionMember)),
})

const FieldDef = Struct("FieldDef", ["span"], {
  name: Ident.name,
  initializer: Option(Lazy(() => Expr)),
})
const MethodDef = Struct("MethodDef", ["span"], {
  name: Lazy(() => ObjectKey),
  body: Lazy(() => Func),
  return_type: Option(Lazy(() => TypeAnnotation)),
  accessor_type: Option(Lazy(() => AccessorType)),
})

const ObjectKey = Enum("ObjectKey", ["span"], {
  Ident: { ident: Ident.name },
  String: { text: Text },
  Computed: { expr: Lazy(() => Expr) },
})

const ObjectLiteralEntry = Enum("ObjectLiteralEntry", ["span"], {
  Ident: { ident: Ident.name },
  Prop: { key: ObjectKey.name, value: Lazy(() => Expr) },
  Method: { method: MethodDef.name },
  Spread: { expr: Lazy(() => Expr) },
})

const Param = Struct("Param", ["span"], {
  pattern: Pattern.name,
  type_annotation: Option(Lazy(() => TypeAnnotation)),
  initializer: Option(Lazy(() => Expr)),
})

const ArrayLiteralMember = Enum("ArrayLiteralMember", ["span"], {
  Expr: { expr: Lazy(() => Expr) },
  Elision: {},
  Spread: { expr: Lazy(() => Expr) },
})

export const Func = Struct("Func", ["span", "visit"], {
  name: Option(Ident.name),
  type_params: List("TypeParam"),
  params: List(Param.name),
  body: Lazy(() => Block),
  return_type: Option(Lazy(() => TypeAnnotation)),
  is_generator: "boolean",
  is_async: "boolean",
})
const TypeParam = Struct("TypeParam", [], {
  ident: Ident.name,
})
const Block = Struct("Block", ["span", "visit"], {
  stmts: List(Lazy(() => Stmt)),
})

const Label = Struct("Label", ["span"], {
  name: "str",
})

export const SourceFile = Struct("SourceFile", ["span", "visit"], {
  path: "str",
  stmts: List(Lazy(() => Stmt)),
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
  test: Option(Lazy(() => Expr)),
  body: List(Lazy(() => Stmt)),
})
const InOrOf = StringUnion("InOrOf", "In", "Of")
const VarDecl = Struct("VarDecl", ["span"], {
  decl_type: Lazy(() => DeclType),
  declarators: List(Lazy(() => VarDeclarator)),
})
const VarDeclarator = Struct("VarDeclarator", [], {
  pattern: Pattern.name,
  type_annotation: Option(Lazy(() => TypeAnnotation)),
  init: Option(Lazy(() => Expr)),
})
const ForInit = Enum("ForInit", [], {
  VarDecl: { decl: Lazy(() => VarDecl) },
  Expr: { expr: Lazy(() => Expr) },
})
const ArrowFnBody = Enum("ArrowFnBody", ["span"], {
  Expr: { expr: Lazy(() => Expr) },
  Block: { block: Lazy(() => Block) },
})
const TemplateLiteralFragment = Enum("TemplateLiteralFragment", ["span"], {
  Text: { text: Text },
  Expr: { expr: Lazy(() => Expr) },
})
const ObjectPatternProperty = Struct("ObjectPatternProperty", ["span"], {
  key: ObjectKey.name,
  value: Pattern.name,
})
const ModuleExportName = Enum("ModuleExportName", [], {
  Ident: { ident: Ident.name },
  String: { text: Text },
})
const ImportSpecifier = Struct("ImportSpecifier", ["span"], {
  type_only: "boolean",
  as_name: Option(Ident.name),
  imported_name: Lazy(() => ModuleExportName),
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
