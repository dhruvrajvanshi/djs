// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.js"

/**
 * Raw source text
 */
type Text = string

export interface SourceFile {
  readonly span: Span
  readonly stmts: readonly Stmt[]
  readonly errors: readonly ParseError[]
}

export interface ParseError {
  readonly span: Span
  readonly message: string
}

export type Stmt =
  | {
      readonly kind: "Expr"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Block"
      readonly span: Span
      readonly block: Block
    }
  | {
      readonly kind: "Return"
      readonly span: Span
      readonly value: Expr | null
    }
  | {
      readonly kind: "VarDecl"
      readonly span: Span
      readonly decl: VarDecl
    }
  | {
      readonly kind: "If"
      readonly span: Span
      readonly condition: Expr
      readonly if_true: Stmt
      readonly if_false: Stmt | null
    }
  | {
      readonly kind: "Switch"
      readonly span: Span
      readonly condition: Expr
      readonly cases: readonly SwitchCase[]
    }
  | {
      readonly kind: "While"
      readonly span: Span
      readonly condition: Expr
      readonly body: Stmt
    }
  | {
      readonly kind: "DoWhile"
      readonly span: Span
      readonly body: Stmt
      readonly condition: Expr
    }
  | {
      readonly kind: "Try"
      readonly span: Span
      readonly try_block: Block
      readonly catch_pattern: Pattern | null
      readonly catch_block: Block | null
      readonly finally_block: Block | null
    }
  | {
      readonly kind: "For"
      readonly span: Span
      readonly init: ForInit
      readonly test: Expr | null
      readonly update: Expr | null
      readonly body: Stmt
    }
  | {
      readonly kind: "ForInOrOf"
      readonly span: Span
      readonly decl_type: DeclType | null
      readonly lhs: Pattern
      readonly in_or_of: InOrOf
      readonly rhs: Expr
      readonly body: Stmt
    }
  | {
      readonly kind: "Break"
      readonly span: Span
      readonly label: Label | null
    }
  | {
      readonly kind: "Continue"
      readonly span: Span
      readonly label: Label | null
    }
  | {
      readonly kind: "Debugger"
      readonly span: Span
    }
  | {
      readonly kind: "With"
      readonly span: Span
      readonly expr: Expr
      readonly body: Stmt
    }
  | {
      readonly kind: "Func"
      readonly span: Span
      readonly func: Func
    }
  | {
      readonly kind: "ClassDecl"
      readonly span: Span
      readonly class: Class
    }
  | {
      readonly kind: "Import"
      readonly span: Span
      readonly default_import: Ident | null
      readonly named_imports: readonly ImportSpecifier[]
      readonly module_specifier: Text
    }
  | {
      readonly kind: "Labeled"
      readonly span: Span
      readonly label: Label
      readonly stmt: Stmt
    }
  | {
      readonly kind: "StructTypeDecl"
      readonly span: Span
      readonly name: Ident
      readonly fields: readonly StructTypeDeclField[]
    }
  | {
      readonly kind: "TypeAlias"
      readonly span: Span
      readonly name: Ident
      readonly type_annotation: TypeAnnotation
    }
  | {
      readonly kind: "Empty"
      readonly span: Span
    }
export type StmtWithKind<K extends Stmt["kind"]> = Extract<Stmt, { kind: K }>
export const Stmt = {
  Expr: (span: Span, expr: Expr): StmtWithKind<"Expr"> => ({
    kind: "Expr",
    span,
    expr: expr,
  }),

  Block: (span: Span, block: Block): StmtWithKind<"Block"> => ({
    kind: "Block",
    span,
    block: block,
  }),

  Return: (span: Span, value: Expr | null): StmtWithKind<"Return"> => ({
    kind: "Return",
    span,
    value: value,
  }),

  VarDecl: (span: Span, decl: VarDecl): StmtWithKind<"VarDecl"> => ({
    kind: "VarDecl",
    span,
    decl: decl,
  }),

  If: (
    span: Span,
    condition: Expr,
    if_true: Stmt,
    if_false: Stmt | null,
  ): StmtWithKind<"If"> => ({
    kind: "If",
    span,
    condition: condition,
    if_true: if_true,
    if_false: if_false,
  }),

  Switch: (
    span: Span,
    condition: Expr,
    cases: readonly SwitchCase[],
  ): StmtWithKind<"Switch"> => ({
    kind: "Switch",
    span,
    condition: condition,
    cases: cases,
  }),

  While: (span: Span, condition: Expr, body: Stmt): StmtWithKind<"While"> => ({
    kind: "While",
    span,
    condition: condition,
    body: body,
  }),

  DoWhile: (
    span: Span,
    body: Stmt,
    condition: Expr,
  ): StmtWithKind<"DoWhile"> => ({
    kind: "DoWhile",
    span,
    body: body,
    condition: condition,
  }),

  Try: (
    span: Span,
    try_block: Block,
    catch_pattern: Pattern | null,
    catch_block: Block | null,
    finally_block: Block | null,
  ): StmtWithKind<"Try"> => ({
    kind: "Try",
    span,
    try_block: try_block,
    catch_pattern: catch_pattern,
    catch_block: catch_block,
    finally_block: finally_block,
  }),

  For: (
    span: Span,
    init: ForInit,
    test: Expr | null,
    update: Expr | null,
    body: Stmt,
  ): StmtWithKind<"For"> => ({
    kind: "For",
    span,
    init: init,
    test: test,
    update: update,
    body: body,
  }),

  ForInOrOf: (
    span: Span,
    decl_type: DeclType | null,
    lhs: Pattern,
    in_or_of: InOrOf,
    rhs: Expr,
    body: Stmt,
  ): StmtWithKind<"ForInOrOf"> => ({
    kind: "ForInOrOf",
    span,
    decl_type: decl_type,
    lhs: lhs,
    in_or_of: in_or_of,
    rhs: rhs,
    body: body,
  }),

  Break: (span: Span, label: Label | null): StmtWithKind<"Break"> => ({
    kind: "Break",
    span,
    label: label,
  }),

  Continue: (span: Span, label: Label | null): StmtWithKind<"Continue"> => ({
    kind: "Continue",
    span,
    label: label,
  }),

  Debugger: (span: Span): StmtWithKind<"Debugger"> => ({
    kind: "Debugger",
    span,
  }),

  With: (span: Span, expr: Expr, body: Stmt): StmtWithKind<"With"> => ({
    kind: "With",
    span,
    expr: expr,
    body: body,
  }),

  Func: (span: Span, func: Func): StmtWithKind<"Func"> => ({
    kind: "Func",
    span,
    func: func,
  }),

  ClassDecl: (span: Span, klass: Class): StmtWithKind<"ClassDecl"> => ({
    kind: "ClassDecl",
    span,
    class: klass,
  }),

  Import: (
    span: Span,
    default_import: Ident | null,
    named_imports: readonly ImportSpecifier[],
    module_specifier: Text,
  ): StmtWithKind<"Import"> => ({
    kind: "Import",
    span,
    default_import: default_import,
    named_imports: named_imports,
    module_specifier: module_specifier,
  }),

  Labeled: (span: Span, label: Label, stmt: Stmt): StmtWithKind<"Labeled"> => ({
    kind: "Labeled",
    span,
    label: label,
    stmt: stmt,
  }),

  StructTypeDecl: (
    span: Span,
    name: Ident,
    fields: readonly StructTypeDeclField[],
  ): StmtWithKind<"StructTypeDecl"> => ({
    kind: "StructTypeDecl",
    span,
    name: name,
    fields: fields,
  }),

  TypeAlias: (
    span: Span,
    name: Ident,
    type_annotation: TypeAnnotation,
  ): StmtWithKind<"TypeAlias"> => ({
    kind: "TypeAlias",
    span,
    name: name,
    type_annotation: type_annotation,
  }),

  Empty: (span: Span): StmtWithKind<"Empty"> => ({ kind: "Empty", span }),
} as const

export interface Class {
  readonly span: Span
  readonly name: Ident | null
  readonly superclass: Expr | null
  readonly body: ClassBody
}

export interface Block {
  readonly span: Span
  readonly stmts: readonly Stmt[]
}

export interface ClassBody {
  readonly span: Span
  readonly members: readonly ClassMember[]
}

export interface MethodDef {
  readonly span: Span
  readonly name: ObjectKey
  readonly body: Func
  readonly return_type: TypeAnnotation | null
  readonly accessor_type: AccessorType | null
}

export type ClassMember =
  | {
      readonly kind: "MethodDef"
      readonly method: MethodDef
    }
  | {
      readonly kind: "FieldDef"
      readonly field: FieldDef
    }
export type ClassMemberWithKind<K extends ClassMember["kind"]> = Extract<
  ClassMember,
  { kind: K }
>
export const ClassMember = {
  MethodDef: (method: MethodDef): ClassMemberWithKind<"MethodDef"> => ({
    kind: "MethodDef",
    method: method,
  }),

  FieldDef: (field: FieldDef): ClassMemberWithKind<"FieldDef"> => ({
    kind: "FieldDef",
    field: field,
  }),
} as const

export interface FieldDef {
  readonly span: Span
  readonly name: Ident
  readonly initializer: Expr | null
}

export interface Ident {
  readonly span: Span
  readonly text: string
}

export type Pattern =
  | {
      readonly kind: "Var"
      readonly span: Span
      readonly ident: Ident
    }
  | {
      readonly kind: "Assignment"
      readonly span: Span
      readonly pattern: Pattern
      readonly initializer: Expr
    }
  | {
      readonly kind: "Array"
      readonly span: Span
      readonly items: readonly Pattern[]
    }
  | {
      readonly kind: "Object"
      readonly span: Span
      readonly properties: readonly ObjectPatternProperty[]
      readonly rest: Pattern | null
    }
  | {
      readonly kind: "Prop"
      readonly span: Span
      readonly expr: Expr
      readonly key: ObjectKey
    }
  | {
      readonly kind: "Elision"
      readonly span: Span
    }
  | {
      readonly kind: "Rest"
      readonly span: Span
      readonly pattern: Pattern
    }
export type PatternWithKind<K extends Pattern["kind"]> = Extract<
  Pattern,
  { kind: K }
>
export const Pattern = {
  Var: (span: Span, ident: Ident): PatternWithKind<"Var"> => ({
    kind: "Var",
    span,
    ident: ident,
  }),

  Assignment: (
    span: Span,
    pattern: Pattern,
    initializer: Expr,
  ): PatternWithKind<"Assignment"> => ({
    kind: "Assignment",
    span,
    pattern: pattern,
    initializer: initializer,
  }),

  Array: (span: Span, items: readonly Pattern[]): PatternWithKind<"Array"> => ({
    kind: "Array",
    span,
    items: items,
  }),

  Object: (
    span: Span,
    properties: readonly ObjectPatternProperty[],
    rest: Pattern | null,
  ): PatternWithKind<"Object"> => ({
    kind: "Object",
    span,
    properties: properties,
    rest: rest,
  }),

  Prop: (span: Span, expr: Expr, key: ObjectKey): PatternWithKind<"Prop"> => ({
    kind: "Prop",
    span,
    expr: expr,
    key: key,
  }),

  Elision: (span: Span): PatternWithKind<"Elision"> => ({
    kind: "Elision",
    span,
  }),

  Rest: (span: Span, pattern: Pattern): PatternWithKind<"Rest"> => ({
    kind: "Rest",
    span,
    pattern: pattern,
  }),
} as const

export interface Label {
  readonly span: Span
  readonly name: string
}

export interface SwitchCase {
  readonly span: Span
  readonly test: Expr | null
  readonly body: readonly Stmt[]
}

export type InOrOf = "In" | "Of"
export const InOrOf = {
  In: "In",
  Of: "Of",
} as const

export interface VarDecl {
  readonly span: Span
  readonly decl_type: DeclType
  readonly declarators: readonly VarDeclarator[]
}

export interface VarDeclarator {
  readonly pattern: Pattern
  readonly type_annotation: TypeAnnotation | null
  readonly init: Expr | null
}

export type ForInit =
  | {
      readonly kind: "VarDecl"
      readonly decl: VarDecl
    }
  | {
      readonly kind: "Expr"
      readonly expr: Expr
    }
export type ForInitWithKind<K extends ForInit["kind"]> = Extract<
  ForInit,
  { kind: K }
>
export const ForInit = {
  VarDecl: (decl: VarDecl): ForInitWithKind<"VarDecl"> => ({
    kind: "VarDecl",
    decl: decl,
  }),

  Expr: (expr: Expr): ForInitWithKind<"Expr"> => ({ kind: "Expr", expr: expr }),
} as const
export type Expr =
  | {
      readonly kind: "Var"
      readonly span: Span
      readonly ident: Ident
    }
  | {
      readonly kind: "BinOp"
      readonly span: Span
      readonly lhs: Expr
      readonly operator: BinOp
      readonly rhs: Expr
    }
  | {
      readonly kind: "ArrowFn"
      readonly span: Span
      readonly params: ParamList
      readonly return_type: TypeAnnotation | null
      readonly body: ArrowFnBody
    }
  | {
      readonly kind: "Func"
      readonly span: Span
      readonly func: Func
    }
  | {
      readonly kind: "Call"
      readonly span: Span
      readonly callee: Expr
      readonly args: readonly Expr[]
    }
  | {
      readonly kind: "Index"
      readonly span: Span
      readonly lhs: Expr
      readonly property: Expr
    }
  | {
      readonly kind: "Prop"
      readonly span: Span
      readonly lhs: Expr
      readonly property: Ident
    }
  | {
      readonly kind: "String"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Number"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Boolean"
      readonly span: Span
      readonly value: boolean
    }
  | {
      readonly kind: "Null"
      readonly span: Span
    }
  | {
      readonly kind: "Undefined"
      readonly span: Span
    }
  | {
      readonly kind: "Object"
      readonly span: Span
      readonly entries: readonly ObjectLiteralEntry[]
    }
  | {
      readonly kind: "Throw"
      readonly span: Span
      readonly value: Expr
    }
  | {
      readonly kind: "PostIncrement"
      readonly span: Span
      readonly value: Expr
    }
  | {
      readonly kind: "PostDecrement"
      readonly span: Span
      readonly value: Expr
    }
  | {
      readonly kind: "PreIncrement"
      readonly span: Span
      readonly value: Expr
    }
  | {
      readonly kind: "PreDecrement"
      readonly span: Span
      readonly value: Expr
    }
  | {
      readonly kind: "Array"
      readonly span: Span
      readonly items: readonly ArrayLiteralMember[]
    }
  | {
      readonly kind: "New"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Yield"
      readonly span: Span
      readonly value: Expr | null
    }
  | {
      readonly kind: "YieldFrom"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Ternary"
      readonly span: Span
      readonly condition: Expr
      readonly if_true: Expr
      readonly if_false: Expr
    }
  | {
      readonly kind: "Assign"
      readonly span: Span
      readonly pattern: Pattern
      readonly operator: AssignOp
      readonly value: Expr
    }
  | {
      readonly kind: "Regex"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Delete"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Void"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "TypeOf"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "UnaryPlus"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "UnaryMinus"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "BitNot"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Not"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Await"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Comma"
      readonly span: Span
      readonly items: readonly Expr[]
    }
  | {
      readonly kind: "Super"
      readonly span: Span
    }
  | {
      readonly kind: "Class"
      readonly span: Span
      readonly class: Class
    }
  | {
      readonly kind: "TemplateLiteral"
      readonly span: Span
      readonly fragments: readonly TemplateLiteralFragment[]
    }
export type ExprWithKind<K extends Expr["kind"]> = Extract<Expr, { kind: K }>
export const Expr = {
  Var: (span: Span, ident: Ident): ExprWithKind<"Var"> => ({
    kind: "Var",
    span,
    ident: ident,
  }),

  BinOp: (
    span: Span,
    lhs: Expr,
    operator: BinOp,
    rhs: Expr,
  ): ExprWithKind<"BinOp"> => ({
    kind: "BinOp",
    span,
    lhs: lhs,
    operator: operator,
    rhs: rhs,
  }),

  ArrowFn: (
    span: Span,
    params: ParamList,
    return_type: TypeAnnotation | null,
    body: ArrowFnBody,
  ): ExprWithKind<"ArrowFn"> => ({
    kind: "ArrowFn",
    span,
    params: params,
    return_type: return_type,
    body: body,
  }),

  Func: (span: Span, func: Func): ExprWithKind<"Func"> => ({
    kind: "Func",
    span,
    func: func,
  }),

  Call: (
    span: Span,
    callee: Expr,
    args: readonly Expr[],
  ): ExprWithKind<"Call"> => ({
    kind: "Call",
    span,
    callee: callee,
    args: args,
  }),

  Index: (span: Span, lhs: Expr, property: Expr): ExprWithKind<"Index"> => ({
    kind: "Index",
    span,
    lhs: lhs,
    property: property,
  }),

  Prop: (span: Span, lhs: Expr, property: Ident): ExprWithKind<"Prop"> => ({
    kind: "Prop",
    span,
    lhs: lhs,
    property: property,
  }),

  String: (span: Span, text: Text): ExprWithKind<"String"> => ({
    kind: "String",
    span,
    text: text,
  }),

  Number: (span: Span, text: Text): ExprWithKind<"Number"> => ({
    kind: "Number",
    span,
    text: text,
  }),

  Boolean: (span: Span, value: boolean): ExprWithKind<"Boolean"> => ({
    kind: "Boolean",
    span,
    value: value,
  }),

  Null: (span: Span): ExprWithKind<"Null"> => ({ kind: "Null", span }),

  Undefined: (span: Span): ExprWithKind<"Undefined"> => ({
    kind: "Undefined",
    span,
  }),

  Object: (
    span: Span,
    entries: readonly ObjectLiteralEntry[],
  ): ExprWithKind<"Object"> => ({ kind: "Object", span, entries: entries }),

  Throw: (span: Span, value: Expr): ExprWithKind<"Throw"> => ({
    kind: "Throw",
    span,
    value: value,
  }),

  PostIncrement: (span: Span, value: Expr): ExprWithKind<"PostIncrement"> => ({
    kind: "PostIncrement",
    span,
    value: value,
  }),

  PostDecrement: (span: Span, value: Expr): ExprWithKind<"PostDecrement"> => ({
    kind: "PostDecrement",
    span,
    value: value,
  }),

  PreIncrement: (span: Span, value: Expr): ExprWithKind<"PreIncrement"> => ({
    kind: "PreIncrement",
    span,
    value: value,
  }),

  PreDecrement: (span: Span, value: Expr): ExprWithKind<"PreDecrement"> => ({
    kind: "PreDecrement",
    span,
    value: value,
  }),

  Array: (
    span: Span,
    items: readonly ArrayLiteralMember[],
  ): ExprWithKind<"Array"> => ({ kind: "Array", span, items: items }),

  New: (span: Span, expr: Expr): ExprWithKind<"New"> => ({
    kind: "New",
    span,
    expr: expr,
  }),

  Yield: (span: Span, value: Expr | null): ExprWithKind<"Yield"> => ({
    kind: "Yield",
    span,
    value: value,
  }),

  YieldFrom: (span: Span, expr: Expr): ExprWithKind<"YieldFrom"> => ({
    kind: "YieldFrom",
    span,
    expr: expr,
  }),

  Ternary: (
    span: Span,
    condition: Expr,
    if_true: Expr,
    if_false: Expr,
  ): ExprWithKind<"Ternary"> => ({
    kind: "Ternary",
    span,
    condition: condition,
    if_true: if_true,
    if_false: if_false,
  }),

  Assign: (
    span: Span,
    pattern: Pattern,
    operator: AssignOp,
    value: Expr,
  ): ExprWithKind<"Assign"> => ({
    kind: "Assign",
    span,
    pattern: pattern,
    operator: operator,
    value: value,
  }),

  Regex: (span: Span, text: Text): ExprWithKind<"Regex"> => ({
    kind: "Regex",
    span,
    text: text,
  }),

  Delete: (span: Span, expr: Expr): ExprWithKind<"Delete"> => ({
    kind: "Delete",
    span,
    expr: expr,
  }),

  Void: (span: Span, expr: Expr): ExprWithKind<"Void"> => ({
    kind: "Void",
    span,
    expr: expr,
  }),

  TypeOf: (span: Span, expr: Expr): ExprWithKind<"TypeOf"> => ({
    kind: "TypeOf",
    span,
    expr: expr,
  }),

  UnaryPlus: (span: Span, expr: Expr): ExprWithKind<"UnaryPlus"> => ({
    kind: "UnaryPlus",
    span,
    expr: expr,
  }),

  UnaryMinus: (span: Span, expr: Expr): ExprWithKind<"UnaryMinus"> => ({
    kind: "UnaryMinus",
    span,
    expr: expr,
  }),

  BitNot: (span: Span, expr: Expr): ExprWithKind<"BitNot"> => ({
    kind: "BitNot",
    span,
    expr: expr,
  }),

  Not: (span: Span, expr: Expr): ExprWithKind<"Not"> => ({
    kind: "Not",
    span,
    expr: expr,
  }),

  Await: (span: Span, expr: Expr): ExprWithKind<"Await"> => ({
    kind: "Await",
    span,
    expr: expr,
  }),

  Comma: (span: Span, items: readonly Expr[]): ExprWithKind<"Comma"> => ({
    kind: "Comma",
    span,
    items: items,
  }),

  Super: (span: Span): ExprWithKind<"Super"> => ({ kind: "Super", span }),

  Class: (span: Span, klass: Class): ExprWithKind<"Class"> => ({
    kind: "Class",
    span,
    class: klass,
  }),

  TemplateLiteral: (
    span: Span,
    fragments: readonly TemplateLiteralFragment[],
  ): ExprWithKind<"TemplateLiteral"> => ({
    kind: "TemplateLiteral",
    span,
    fragments: fragments,
  }),
} as const

export interface StructTypeDeclField {
  readonly is_readonly: boolean
  readonly label: Ident
  readonly type_annotation: TypeAnnotation
}

export type TypeAnnotation =
  | {
      readonly kind: "Ident"
      readonly span: Span
      readonly ident: Ident
    }
  | {
      readonly kind: "Union"
      readonly span: Span
      readonly left: TypeAnnotation
      readonly right: TypeAnnotation
    }
  | {
      readonly kind: "Array"
      readonly span: Span
      readonly item: TypeAnnotation
    }
  | {
      readonly kind: "ReadonlyArray"
      readonly span: Span
      readonly item: TypeAnnotation
    }
  | {
      readonly kind: "Application"
      readonly span: Span
      readonly callee: TypeAnnotation
      readonly args: readonly TypeAnnotation[]
    }
  | {
      readonly kind: "String"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Func"
      readonly span: Span
      readonly params: readonly FuncTypeParam[]
      readonly returns: TypeAnnotation
    }
export type TypeAnnotationWithKind<K extends TypeAnnotation["kind"]> = Extract<
  TypeAnnotation,
  { kind: K }
>
export const TypeAnnotation = {
  Ident: (span: Span, ident: Ident): TypeAnnotationWithKind<"Ident"> => ({
    kind: "Ident",
    span,
    ident: ident,
  }),

  Union: (
    span: Span,
    left: TypeAnnotation,
    right: TypeAnnotation,
  ): TypeAnnotationWithKind<"Union"> => ({
    kind: "Union",
    span,
    left: left,
    right: right,
  }),

  Array: (
    span: Span,
    item: TypeAnnotation,
  ): TypeAnnotationWithKind<"Array"> => ({ kind: "Array", span, item: item }),

  ReadonlyArray: (
    span: Span,
    item: TypeAnnotation,
  ): TypeAnnotationWithKind<"ReadonlyArray"> => ({
    kind: "ReadonlyArray",
    span,
    item: item,
  }),

  Application: (
    span: Span,
    callee: TypeAnnotation,
    args: readonly TypeAnnotation[],
  ): TypeAnnotationWithKind<"Application"> => ({
    kind: "Application",
    span,
    callee: callee,
    args: args,
  }),

  String: (span: Span, text: Text): TypeAnnotationWithKind<"String"> => ({
    kind: "String",
    span,
    text: text,
  }),

  Func: (
    span: Span,
    params: readonly FuncTypeParam[],
    returns: TypeAnnotation,
  ): TypeAnnotationWithKind<"Func"> => ({
    kind: "Func",
    span,
    params: params,
    returns: returns,
  }),
} as const

export interface FuncTypeParam {
  readonly label: Ident
  readonly type_annotation: TypeAnnotation
}

export type ObjectLiteralEntry =
  | {
      readonly kind: "Ident"
      readonly span: Span
      readonly ident: Ident
    }
  | {
      readonly kind: "Prop"
      readonly span: Span
      readonly key: ObjectKey
      readonly value: Expr
    }
  | {
      readonly kind: "Method"
      readonly span: Span
      readonly method: MethodDef
    }
  | {
      readonly kind: "Spread"
      readonly span: Span
      readonly expr: Expr
    }
export type ObjectLiteralEntryWithKind<K extends ObjectLiteralEntry["kind"]> =
  Extract<ObjectLiteralEntry, { kind: K }>
export const ObjectLiteralEntry = {
  Ident: (span: Span, ident: Ident): ObjectLiteralEntryWithKind<"Ident"> => ({
    kind: "Ident",
    span,
    ident: ident,
  }),

  Prop: (
    span: Span,
    key: ObjectKey,
    value: Expr,
  ): ObjectLiteralEntryWithKind<"Prop"> => ({
    kind: "Prop",
    span,
    key: key,
    value: value,
  }),

  Method: (
    span: Span,
    method: MethodDef,
  ): ObjectLiteralEntryWithKind<"Method"> => ({
    kind: "Method",
    span,
    method: method,
  }),

  Spread: (span: Span, expr: Expr): ObjectLiteralEntryWithKind<"Spread"> => ({
    kind: "Spread",
    span,
    expr: expr,
  }),
} as const
export type ObjectKey =
  | {
      readonly kind: "Ident"
      readonly span: Span
      readonly ident: Ident
    }
  | {
      readonly kind: "String"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Computed"
      readonly span: Span
      readonly expr: Expr
    }
export type ObjectKeyWithKind<K extends ObjectKey["kind"]> = Extract<
  ObjectKey,
  { kind: K }
>
export const ObjectKey = {
  Ident: (span: Span, ident: Ident): ObjectKeyWithKind<"Ident"> => ({
    kind: "Ident",
    span,
    ident: ident,
  }),

  String: (span: Span, text: Text): ObjectKeyWithKind<"String"> => ({
    kind: "String",
    span,
    text: text,
  }),

  Computed: (span: Span, expr: Expr): ObjectKeyWithKind<"Computed"> => ({
    kind: "Computed",
    span,
    expr: expr,
  }),
} as const

export interface ParamList {
  readonly span: Span
  readonly params: readonly Param[]
}

export interface Param {
  readonly span: Span
  readonly pattern: Pattern
  readonly type_annotation: TypeAnnotation | null
  readonly initializer: Expr | null
}

export interface Func {
  readonly span: Span
  readonly name: Ident | null
  readonly type_params: readonly TypeParam[]
  readonly params: ParamList
  readonly body: Block
  readonly return_type: TypeAnnotation | null
  readonly is_generator: boolean
  readonly is_async: boolean
}

export interface TypeParam {
  readonly ident: Ident
}

export type ArrayLiteralMember =
  | {
      readonly kind: "Expr"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Elision"
      readonly span: Span
    }
  | {
      readonly kind: "Spread"
      readonly span: Span
      readonly expr: Expr
    }
export type ArrayLiteralMemberWithKind<K extends ArrayLiteralMember["kind"]> =
  Extract<ArrayLiteralMember, { kind: K }>
export const ArrayLiteralMember = {
  Expr: (span: Span, expr: Expr): ArrayLiteralMemberWithKind<"Expr"> => ({
    kind: "Expr",
    span,
    expr: expr,
  }),

  Elision: (span: Span): ArrayLiteralMemberWithKind<"Elision"> => ({
    kind: "Elision",
    span,
  }),

  Spread: (span: Span, expr: Expr): ArrayLiteralMemberWithKind<"Spread"> => ({
    kind: "Spread",
    span,
    expr: expr,
  }),
} as const
export type ArrowFnBody =
  | {
      readonly kind: "Expr"
      readonly span: Span
      readonly expr: Expr
    }
  | {
      readonly kind: "Block"
      readonly span: Span
      readonly block: Block
    }
export type ArrowFnBodyWithKind<K extends ArrowFnBody["kind"]> = Extract<
  ArrowFnBody,
  { kind: K }
>
export const ArrowFnBody = {
  Expr: (span: Span, expr: Expr): ArrowFnBodyWithKind<"Expr"> => ({
    kind: "Expr",
    span,
    expr: expr,
  }),

  Block: (span: Span, block: Block): ArrowFnBodyWithKind<"Block"> => ({
    kind: "Block",
    span,
    block: block,
  }),
} as const
export type TemplateLiteralFragment =
  | {
      readonly kind: "Text"
      readonly span: Span
      readonly text: Text
    }
  | {
      readonly kind: "Expr"
      readonly span: Span
      readonly expr: Expr
    }
export type TemplateLiteralFragmentWithKind<
  K extends TemplateLiteralFragment["kind"],
> = Extract<TemplateLiteralFragment, { kind: K }>
export const TemplateLiteralFragment = {
  Text: (span: Span, text: Text): TemplateLiteralFragmentWithKind<"Text"> => ({
    kind: "Text",
    span,
    text: text,
  }),

  Expr: (span: Span, expr: Expr): TemplateLiteralFragmentWithKind<"Expr"> => ({
    kind: "Expr",
    span,
    expr: expr,
  }),
} as const

export interface ObjectPatternProperty {
  readonly span: Span
  readonly key: ObjectKey
  readonly value: Pattern
}

export type ModuleExportName =
  | {
      readonly kind: "Ident"
      readonly ident: Ident
    }
  | {
      readonly kind: "String"
      readonly text: Text
    }
export type ModuleExportNameWithKind<K extends ModuleExportName["kind"]> =
  Extract<ModuleExportName, { kind: K }>
export const ModuleExportName = {
  Ident: (ident: Ident): ModuleExportNameWithKind<"Ident"> => ({
    kind: "Ident",
    ident: ident,
  }),

  String: (text: Text): ModuleExportNameWithKind<"String"> => ({
    kind: "String",
    text: text,
  }),
} as const

export interface ImportSpecifier {
  readonly span: Span
  readonly type_only: boolean
  readonly as_name: Ident | null
  readonly imported_name: ModuleExportName
}

export type BinOp =
  | "Add"
  | "Sub"
  | "Mul"
  | "Div"
  | "Mod"
  | "BitXor"
  | "BitAnd"
  | "BitOr"
  | "And"
  | "Or"
  | "Coalesce"
  | "Gt"
  | "Lt"
  | "Gte"
  | "Lte"
  | "EqEq"
  | "EqEqEq"
  | "NotEq"
  | "NotEqEq"
  | "In"
  | "Instanceof"
  | "LeftShift"
  | "RightShift"
  | "UnsignedRightShift"
export const BinOp = {
  Add: "Add",
  Sub: "Sub",
  Mul: "Mul",
  Div: "Div",
  Mod: "Mod",
  BitXor: "BitXor",
  BitAnd: "BitAnd",
  BitOr: "BitOr",
  And: "And",
  Or: "Or",
  Coalesce: "Coalesce",
  Gt: "Gt",
  Lt: "Lt",
  Gte: "Gte",
  Lte: "Lte",
  EqEq: "EqEq",
  EqEqEq: "EqEqEq",
  NotEq: "NotEq",
  NotEqEq: "NotEqEq",
  In: "In",
  Instanceof: "Instanceof",
  LeftShift: "LeftShift",
  RightShift: "RightShift",
  UnsignedRightShift: "UnsignedRightShift",
} as const
export type AssignOp =
  | "Eq"
  | "MulEq"
  | "DivEq"
  | "ModEq"
  | "AddEq"
  | "SubEq"
  | "LeftShiftEq"
  | "RightShiftEq"
  | "UnsignedRightShiftEq"
  | "BitAndEq"
  | "BitXorEq"
  | "BitOrEq"
  | "ExponentEq"
export const AssignOp = {
  Eq: "Eq",
  MulEq: "MulEq",
  DivEq: "DivEq",
  ModEq: "ModEq",
  AddEq: "AddEq",
  SubEq: "SubEq",
  LeftShiftEq: "LeftShiftEq",
  RightShiftEq: "RightShiftEq",
  UnsignedRightShiftEq: "UnsignedRightShiftEq",
  BitAndEq: "BitAndEq",
  BitXorEq: "BitXorEq",
  BitOrEq: "BitOrEq",
  ExponentEq: "ExponentEq",
} as const
export type DeclType = "Let" | "Const" | "Var"
export const DeclType = {
  Let: "Let",
  Const: "Const",
  Var: "Var",
} as const
export type AccessorType = "Get" | "Set"
export const AccessorType = {
  Get: "Get",
  Set: "Set",
} as const
