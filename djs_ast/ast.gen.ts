// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.ts"
import type { Diagnostic } from "./Diagnostic.ts"

/**
 * Raw source text
 */
type Text = string

export interface SourceFile {
  readonly span: Span
  readonly path: string
  readonly stmts: readonly Stmt[]
  readonly errors: readonly Diagnostic[]
}

export type Stmt =
  | ExprStmt
  | BlockStmt
  | ReturnStmt
  | VarDeclStmt
  | IfStmt
  | SwitchStmt
  | WhileStmt
  | DoWhileStmt
  | TryStmt
  | ForStmt
  | ForInOrOfStmt
  | BreakStmt
  | ContinueStmt
  | DebuggerStmt
  | WithStmt
  | FuncStmt
  | ClassDeclStmt
  | ImportStmt
  | LabeledStmt
  | ObjectTypeDeclStmt
  | TypeAliasStmt
  | LJSExternFunctionStmt
  | EmptyStmt
export class ExprStmt {
  readonly kind: "Expr" = "Expr"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class BlockStmt {
  readonly kind: "Block" = "Block"
  constructor(
    readonly span: Span,
    readonly block: Block,
  ) {}
}
export class ReturnStmt {
  readonly kind: "Return" = "Return"
  constructor(
    readonly span: Span,
    readonly value: Expr | null,
  ) {}
}
export class VarDeclStmt {
  readonly kind: "VarDecl" = "VarDecl"
  constructor(
    readonly span: Span,
    readonly decl: VarDecl,
  ) {}
}
export class IfStmt {
  readonly kind: "If" = "If"
  constructor(
    readonly span: Span,
    readonly condition: Expr,
    readonly if_true: Stmt,
    readonly if_false: Stmt | null,
  ) {}
}
export class SwitchStmt {
  readonly kind: "Switch" = "Switch"
  constructor(
    readonly span: Span,
    readonly condition: Expr,
    readonly cases: readonly SwitchCase[],
  ) {}
}
export class WhileStmt {
  readonly kind: "While" = "While"
  constructor(
    readonly span: Span,
    readonly condition: Expr,
    readonly body: Stmt,
  ) {}
}
export class DoWhileStmt {
  readonly kind: "DoWhile" = "DoWhile"
  constructor(
    readonly span: Span,
    readonly body: Stmt,
    readonly condition: Expr,
  ) {}
}
export class TryStmt {
  readonly kind: "Try" = "Try"
  constructor(
    readonly span: Span,
    readonly try_block: Block,
    readonly catch_pattern: Pattern | null,
    readonly catch_block: Block | null,
    readonly finally_block: Block | null,
  ) {}
}
export class ForStmt {
  readonly kind: "For" = "For"
  constructor(
    readonly span: Span,
    readonly init: ForInit,
    readonly test: Expr | null,
    readonly update: Expr | null,
    readonly body: Stmt,
  ) {}
}
export class ForInOrOfStmt {
  readonly kind: "ForInOrOf" = "ForInOrOf"
  constructor(
    readonly span: Span,
    readonly decl_type: DeclType | null,
    readonly lhs: Pattern,
    readonly in_or_of: InOrOf,
    readonly rhs: Expr,
    readonly body: Stmt,
  ) {}
}
export class BreakStmt {
  readonly kind: "Break" = "Break"
  constructor(
    readonly span: Span,
    readonly label: Label | null,
  ) {}
}
export class ContinueStmt {
  readonly kind: "Continue" = "Continue"
  constructor(
    readonly span: Span,
    readonly label: Label | null,
  ) {}
}
export class DebuggerStmt {
  readonly kind: "Debugger" = "Debugger"
  constructor(readonly span: Span) {}
}
export class WithStmt {
  readonly kind: "With" = "With"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
    readonly body: Stmt,
  ) {}
}
export class FuncStmt {
  readonly kind: "Func" = "Func"
  constructor(
    readonly span: Span,
    readonly func: Func,
  ) {}
}
export class ClassDeclStmt {
  readonly kind: "ClassDecl" = "ClassDecl"
  constructor(
    readonly span: Span,
    readonly klass: Class,
  ) {}
}
export class ImportStmt {
  readonly kind: "Import" = "Import"
  constructor(
    readonly span: Span,
    readonly default_import: Ident | null,
    readonly named_imports: readonly ImportSpecifier[],
    readonly module_specifier: Text,
  ) {}
}
export class LabeledStmt {
  readonly kind: "Labeled" = "Labeled"
  constructor(
    readonly span: Span,
    readonly label: Label,
    readonly stmt: Stmt,
  ) {}
}
export class ObjectTypeDeclStmt {
  readonly kind: "ObjectTypeDecl" = "ObjectTypeDecl"
  constructor(
    readonly span: Span,
    readonly name: Ident,
    readonly fields: readonly ObjectTypeDeclField[],
  ) {}
}
export class TypeAliasStmt {
  readonly kind: "TypeAlias" = "TypeAlias"
  constructor(
    readonly span: Span,
    readonly name: Ident,
    readonly type_annotation: TypeAnnotation,
  ) {}
}
export class LJSExternFunctionStmt {
  readonly kind: "LJSExternFunction" = "LJSExternFunction"
  constructor(
    readonly span: Span,
    readonly func: LJSExternFunction,
  ) {}
}
export class EmptyStmt {
  readonly kind: "Empty" = "Empty"
  constructor(readonly span: Span) {}
}

export const Stmt = {
  Expr: (span: Span, expr: Expr): ExprStmt => new ExprStmt(span, expr),

  Block: (span: Span, block: Block): BlockStmt => new BlockStmt(span, block),

  Return: (span: Span, value: Expr | null): ReturnStmt =>
    new ReturnStmt(span, value),

  VarDecl: (span: Span, decl: VarDecl): VarDeclStmt =>
    new VarDeclStmt(span, decl),

  If: (
    span: Span,
    condition: Expr,
    if_true: Stmt,
    if_false: Stmt | null,
  ): IfStmt => new IfStmt(span, condition, if_true, if_false),

  Switch: (
    span: Span,
    condition: Expr,
    cases: readonly SwitchCase[],
  ): SwitchStmt => new SwitchStmt(span, condition, cases),

  While: (span: Span, condition: Expr, body: Stmt): WhileStmt =>
    new WhileStmt(span, condition, body),

  DoWhile: (span: Span, body: Stmt, condition: Expr): DoWhileStmt =>
    new DoWhileStmt(span, body, condition),

  Try: (
    span: Span,
    try_block: Block,
    catch_pattern: Pattern | null,
    catch_block: Block | null,
    finally_block: Block | null,
  ): TryStmt =>
    new TryStmt(span, try_block, catch_pattern, catch_block, finally_block),

  For: (
    span: Span,
    init: ForInit,
    test: Expr | null,
    update: Expr | null,
    body: Stmt,
  ): ForStmt => new ForStmt(span, init, test, update, body),

  ForInOrOf: (
    span: Span,
    decl_type: DeclType | null,
    lhs: Pattern,
    in_or_of: InOrOf,
    rhs: Expr,
    body: Stmt,
  ): ForInOrOfStmt =>
    new ForInOrOfStmt(span, decl_type, lhs, in_or_of, rhs, body),

  Break: (span: Span, label: Label | null): BreakStmt =>
    new BreakStmt(span, label),

  Continue: (span: Span, label: Label | null): ContinueStmt =>
    new ContinueStmt(span, label),

  Debugger: (span: Span): DebuggerStmt => new DebuggerStmt(span),

  With: (span: Span, expr: Expr, body: Stmt): WithStmt =>
    new WithStmt(span, expr, body),

  Func: (span: Span, func: Func): FuncStmt => new FuncStmt(span, func),

  ClassDecl: (span: Span, klass: Class): ClassDeclStmt =>
    new ClassDeclStmt(span, klass),

  Import: (
    span: Span,
    default_import: Ident | null,
    named_imports: readonly ImportSpecifier[],
    module_specifier: Text,
  ): ImportStmt =>
    new ImportStmt(span, default_import, named_imports, module_specifier),

  Labeled: (span: Span, label: Label, stmt: Stmt): LabeledStmt =>
    new LabeledStmt(span, label, stmt),

  ObjectTypeDecl: (
    span: Span,
    name: Ident,
    fields: readonly ObjectTypeDeclField[],
  ): ObjectTypeDeclStmt => new ObjectTypeDeclStmt(span, name, fields),

  TypeAlias: (
    span: Span,
    name: Ident,
    type_annotation: TypeAnnotation,
  ): TypeAliasStmt => new TypeAliasStmt(span, name, type_annotation),

  LJSExternFunction: (
    span: Span,
    func: LJSExternFunction,
  ): LJSExternFunctionStmt => new LJSExternFunctionStmt(span, func),

  Empty: (span: Span): EmptyStmt => new EmptyStmt(span),
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

export type ClassMember = MethodDefClassMember | FieldDefClassMember
export class MethodDefClassMember {
  readonly kind: "MethodDef" = "MethodDef"
  constructor(readonly method: MethodDef) {}
}
export class FieldDefClassMember {
  readonly kind: "FieldDef" = "FieldDef"
  constructor(readonly field: FieldDef) {}
}

export const ClassMember = {
  MethodDef: (method: MethodDef): MethodDefClassMember =>
    new MethodDefClassMember(method),

  FieldDef: (field: FieldDef): FieldDefClassMember =>
    new FieldDefClassMember(field),
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
  | VarPattern
  | AssignmentPattern
  | ArrayPattern
  | ObjectPattern
  | PropPattern
  | ElisionPattern
  | RestPattern
export class VarPattern {
  readonly kind: "Var" = "Var"
  constructor(
    readonly span: Span,
    readonly ident: Ident,
  ) {}
}
export class AssignmentPattern {
  readonly kind: "Assignment" = "Assignment"
  constructor(
    readonly span: Span,
    readonly pattern: Pattern,
    readonly initializer: Expr,
  ) {}
}
export class ArrayPattern {
  readonly kind: "Array" = "Array"
  constructor(
    readonly span: Span,
    readonly items: readonly Pattern[],
  ) {}
}
export class ObjectPattern {
  readonly kind: "Object" = "Object"
  constructor(
    readonly span: Span,
    readonly properties: readonly ObjectPatternProperty[],
    readonly rest: Pattern | null,
  ) {}
}
export class PropPattern {
  readonly kind: "Prop" = "Prop"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
    readonly key: ObjectKey,
  ) {}
}
export class ElisionPattern {
  readonly kind: "Elision" = "Elision"
  constructor(readonly span: Span) {}
}
export class RestPattern {
  readonly kind: "Rest" = "Rest"
  constructor(
    readonly span: Span,
    readonly pattern: Pattern,
  ) {}
}

export const Pattern = {
  Var: (span: Span, ident: Ident): VarPattern => new VarPattern(span, ident),

  Assignment: (
    span: Span,
    pattern: Pattern,
    initializer: Expr,
  ): AssignmentPattern => new AssignmentPattern(span, pattern, initializer),

  Array: (span: Span, items: readonly Pattern[]): ArrayPattern =>
    new ArrayPattern(span, items),

  Object: (
    span: Span,
    properties: readonly ObjectPatternProperty[],
    rest: Pattern | null,
  ): ObjectPattern => new ObjectPattern(span, properties, rest),

  Prop: (span: Span, expr: Expr, key: ObjectKey): PropPattern =>
    new PropPattern(span, expr, key),

  Elision: (span: Span): ElisionPattern => new ElisionPattern(span),

  Rest: (span: Span, pattern: Pattern): RestPattern =>
    new RestPattern(span, pattern),
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

export type ForInit = VarDeclForInit | ExprForInit
export class VarDeclForInit {
  readonly kind: "VarDecl" = "VarDecl"
  constructor(readonly decl: VarDecl) {}
}
export class ExprForInit {
  readonly kind: "Expr" = "Expr"
  constructor(readonly expr: Expr) {}
}

export const ForInit = {
  VarDecl: (decl: VarDecl): VarDeclForInit => new VarDeclForInit(decl),

  Expr: (expr: Expr): ExprForInit => new ExprForInit(expr),
} as const

export type Expr =
  | VarExpr
  | ParenExpr
  | BinOpExpr
  | ArrowFnExpr
  | FuncExpr
  | CallExpr
  | IndexExpr
  | PropExpr
  | StringExpr
  | NumberExpr
  | BooleanExpr
  | NullExpr
  | UndefinedExpr
  | ObjectExpr
  | ThrowExpr
  | PostIncrementExpr
  | PostDecrementExpr
  | PreIncrementExpr
  | PreDecrementExpr
  | ArrayExpr
  | NewExpr
  | YieldExpr
  | YieldFromExpr
  | TernaryExpr
  | AssignExpr
  | RegexExpr
  | DeleteExpr
  | VoidExpr
  | TypeOfExpr
  | UnaryPlusExpr
  | UnaryMinusExpr
  | BitNotExpr
  | NotExpr
  | AwaitExpr
  | CommaExpr
  | SuperExpr
  | ClassExpr
  | TemplateLiteralExpr
  | TaggedTemplateLiteralExpr
export class VarExpr {
  readonly kind: "Var" = "Var"
  constructor(
    readonly span: Span,
    readonly ident: Ident,
  ) {}
}
export class ParenExpr {
  readonly kind: "Paren" = "Paren"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class BinOpExpr {
  readonly kind: "BinOp" = "BinOp"
  constructor(
    readonly span: Span,
    readonly lhs: Expr,
    readonly operator: BinOp,
    readonly rhs: Expr,
  ) {}
}
export class ArrowFnExpr {
  readonly kind: "ArrowFn" = "ArrowFn"
  constructor(
    readonly span: Span,
    readonly params: ParamList,
    readonly return_type: TypeAnnotation | null,
    readonly body: ArrowFnBody,
  ) {}
}
export class FuncExpr {
  readonly kind: "Func" = "Func"
  constructor(
    readonly span: Span,
    readonly func: Func,
  ) {}
}
export class CallExpr {
  readonly kind: "Call" = "Call"
  constructor(
    readonly span: Span,
    readonly callee: Expr,
    readonly args: readonly Expr[],
    readonly spread: Expr | null,
    readonly is_optional: boolean,
  ) {}
}
export class IndexExpr {
  readonly kind: "Index" = "Index"
  constructor(
    readonly span: Span,
    readonly lhs: Expr,
    readonly property: Expr,
    readonly is_optional: boolean,
  ) {}
}
export class PropExpr {
  readonly kind: "Prop" = "Prop"
  constructor(
    readonly span: Span,
    readonly lhs: Expr,
    readonly property: Ident,
    readonly is_optional: boolean,
  ) {}
}
export class StringExpr {
  readonly kind: "String" = "String"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class NumberExpr {
  readonly kind: "Number" = "Number"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class BooleanExpr {
  readonly kind: "Boolean" = "Boolean"
  constructor(
    readonly span: Span,
    readonly value: boolean,
  ) {}
}
export class NullExpr {
  readonly kind: "Null" = "Null"
  constructor(readonly span: Span) {}
}
export class UndefinedExpr {
  readonly kind: "Undefined" = "Undefined"
  constructor(readonly span: Span) {}
}
export class ObjectExpr {
  readonly kind: "Object" = "Object"
  constructor(
    readonly span: Span,
    readonly entries: readonly ObjectLiteralEntry[],
  ) {}
}
export class ThrowExpr {
  readonly kind: "Throw" = "Throw"
  constructor(
    readonly span: Span,
    readonly value: Expr,
  ) {}
}
export class PostIncrementExpr {
  readonly kind: "PostIncrement" = "PostIncrement"
  constructor(
    readonly span: Span,
    readonly value: Expr,
  ) {}
}
export class PostDecrementExpr {
  readonly kind: "PostDecrement" = "PostDecrement"
  constructor(
    readonly span: Span,
    readonly value: Expr,
  ) {}
}
export class PreIncrementExpr {
  readonly kind: "PreIncrement" = "PreIncrement"
  constructor(
    readonly span: Span,
    readonly value: Expr,
  ) {}
}
export class PreDecrementExpr {
  readonly kind: "PreDecrement" = "PreDecrement"
  constructor(
    readonly span: Span,
    readonly value: Expr,
  ) {}
}
export class ArrayExpr {
  readonly kind: "Array" = "Array"
  constructor(
    readonly span: Span,
    readonly items: readonly ArrayLiteralMember[],
  ) {}
}
export class NewExpr {
  readonly kind: "New" = "New"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class YieldExpr {
  readonly kind: "Yield" = "Yield"
  constructor(
    readonly span: Span,
    readonly value: Expr | null,
  ) {}
}
export class YieldFromExpr {
  readonly kind: "YieldFrom" = "YieldFrom"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class TernaryExpr {
  readonly kind: "Ternary" = "Ternary"
  constructor(
    readonly span: Span,
    readonly condition: Expr,
    readonly if_true: Expr,
    readonly if_false: Expr,
  ) {}
}
export class AssignExpr {
  readonly kind: "Assign" = "Assign"
  constructor(
    readonly span: Span,
    readonly pattern: Pattern,
    readonly operator: AssignOp,
    readonly value: Expr,
  ) {}
}
export class RegexExpr {
  readonly kind: "Regex" = "Regex"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class DeleteExpr {
  readonly kind: "Delete" = "Delete"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class VoidExpr {
  readonly kind: "Void" = "Void"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class TypeOfExpr {
  readonly kind: "TypeOf" = "TypeOf"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class UnaryPlusExpr {
  readonly kind: "UnaryPlus" = "UnaryPlus"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class UnaryMinusExpr {
  readonly kind: "UnaryMinus" = "UnaryMinus"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class BitNotExpr {
  readonly kind: "BitNot" = "BitNot"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class NotExpr {
  readonly kind: "Not" = "Not"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class AwaitExpr {
  readonly kind: "Await" = "Await"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class CommaExpr {
  readonly kind: "Comma" = "Comma"
  constructor(
    readonly span: Span,
    readonly items: readonly Expr[],
  ) {}
}
export class SuperExpr {
  readonly kind: "Super" = "Super"
  constructor(readonly span: Span) {}
}
export class ClassExpr {
  readonly kind: "Class" = "Class"
  constructor(
    readonly span: Span,
    readonly klass: Class,
  ) {}
}
export class TemplateLiteralExpr {
  readonly kind: "TemplateLiteral" = "TemplateLiteral"
  constructor(
    readonly span: Span,
    readonly fragments: readonly TemplateLiteralFragment[],
  ) {}
}
export class TaggedTemplateLiteralExpr {
  readonly kind: "TaggedTemplateLiteral" = "TaggedTemplateLiteral"
  constructor(
    readonly span: Span,
    readonly tag: Expr,
    readonly fragments: readonly TemplateLiteralFragment[],
  ) {}
}

export const Expr = {
  Var: (span: Span, ident: Ident): VarExpr => new VarExpr(span, ident),

  Paren: (span: Span, expr: Expr): ParenExpr => new ParenExpr(span, expr),

  BinOp: (span: Span, lhs: Expr, operator: BinOp, rhs: Expr): BinOpExpr =>
    new BinOpExpr(span, lhs, operator, rhs),

  ArrowFn: (
    span: Span,
    params: ParamList,
    return_type: TypeAnnotation | null,
    body: ArrowFnBody,
  ): ArrowFnExpr => new ArrowFnExpr(span, params, return_type, body),

  Func: (span: Span, func: Func): FuncExpr => new FuncExpr(span, func),

  Call: (
    span: Span,
    callee: Expr,
    args: readonly Expr[],
    spread: Expr | null,
    is_optional: boolean,
  ): CallExpr => new CallExpr(span, callee, args, spread, is_optional),

  Index: (
    span: Span,
    lhs: Expr,
    property: Expr,
    is_optional: boolean,
  ): IndexExpr => new IndexExpr(span, lhs, property, is_optional),

  Prop: (
    span: Span,
    lhs: Expr,
    property: Ident,
    is_optional: boolean,
  ): PropExpr => new PropExpr(span, lhs, property, is_optional),

  String: (span: Span, text: Text): StringExpr => new StringExpr(span, text),

  Number: (span: Span, text: Text): NumberExpr => new NumberExpr(span, text),

  Boolean: (span: Span, value: boolean): BooleanExpr =>
    new BooleanExpr(span, value),

  Null: (span: Span): NullExpr => new NullExpr(span),

  Undefined: (span: Span): UndefinedExpr => new UndefinedExpr(span),

  Object: (span: Span, entries: readonly ObjectLiteralEntry[]): ObjectExpr =>
    new ObjectExpr(span, entries),

  Throw: (span: Span, value: Expr): ThrowExpr => new ThrowExpr(span, value),

  PostIncrement: (span: Span, value: Expr): PostIncrementExpr =>
    new PostIncrementExpr(span, value),

  PostDecrement: (span: Span, value: Expr): PostDecrementExpr =>
    new PostDecrementExpr(span, value),

  PreIncrement: (span: Span, value: Expr): PreIncrementExpr =>
    new PreIncrementExpr(span, value),

  PreDecrement: (span: Span, value: Expr): PreDecrementExpr =>
    new PreDecrementExpr(span, value),

  Array: (span: Span, items: readonly ArrayLiteralMember[]): ArrayExpr =>
    new ArrayExpr(span, items),

  New: (span: Span, expr: Expr): NewExpr => new NewExpr(span, expr),

  Yield: (span: Span, value: Expr | null): YieldExpr =>
    new YieldExpr(span, value),

  YieldFrom: (span: Span, expr: Expr): YieldFromExpr =>
    new YieldFromExpr(span, expr),

  Ternary: (
    span: Span,
    condition: Expr,
    if_true: Expr,
    if_false: Expr,
  ): TernaryExpr => new TernaryExpr(span, condition, if_true, if_false),

  Assign: (
    span: Span,
    pattern: Pattern,
    operator: AssignOp,
    value: Expr,
  ): AssignExpr => new AssignExpr(span, pattern, operator, value),

  Regex: (span: Span, text: Text): RegexExpr => new RegexExpr(span, text),

  Delete: (span: Span, expr: Expr): DeleteExpr => new DeleteExpr(span, expr),

  Void: (span: Span, expr: Expr): VoidExpr => new VoidExpr(span, expr),

  TypeOf: (span: Span, expr: Expr): TypeOfExpr => new TypeOfExpr(span, expr),

  UnaryPlus: (span: Span, expr: Expr): UnaryPlusExpr =>
    new UnaryPlusExpr(span, expr),

  UnaryMinus: (span: Span, expr: Expr): UnaryMinusExpr =>
    new UnaryMinusExpr(span, expr),

  BitNot: (span: Span, expr: Expr): BitNotExpr => new BitNotExpr(span, expr),

  Not: (span: Span, expr: Expr): NotExpr => new NotExpr(span, expr),

  Await: (span: Span, expr: Expr): AwaitExpr => new AwaitExpr(span, expr),

  Comma: (span: Span, items: readonly Expr[]): CommaExpr =>
    new CommaExpr(span, items),

  Super: (span: Span): SuperExpr => new SuperExpr(span),

  Class: (span: Span, klass: Class): ClassExpr => new ClassExpr(span, klass),

  TemplateLiteral: (
    span: Span,
    fragments: readonly TemplateLiteralFragment[],
  ): TemplateLiteralExpr => new TemplateLiteralExpr(span, fragments),

  TaggedTemplateLiteral: (
    span: Span,
    tag: Expr,
    fragments: readonly TemplateLiteralFragment[],
  ): TaggedTemplateLiteralExpr =>
    new TaggedTemplateLiteralExpr(span, tag, fragments),
} as const

export interface ObjectTypeDeclField {
  readonly is_readonly: boolean
  readonly label: Ident
  readonly type_annotation: TypeAnnotation
}

export type TypeAnnotation =
  | IdentTypeAnnotation
  | UnionTypeAnnotation
  | ArrayTypeAnnotation
  | ReadonlyArrayTypeAnnotation
  | ApplicationTypeAnnotation
  | StringTypeAnnotation
  | FuncTypeAnnotation
  | LJSConstPtrTypeAnnotation
  | LJSPtrTypeAnnotation
export class IdentTypeAnnotation {
  readonly kind: "Ident" = "Ident"
  constructor(
    readonly span: Span,
    readonly ident: Ident,
  ) {}
}
export class UnionTypeAnnotation {
  readonly kind: "Union" = "Union"
  constructor(
    readonly span: Span,
    readonly left: TypeAnnotation,
    readonly right: TypeAnnotation,
  ) {}
}
export class ArrayTypeAnnotation {
  readonly kind: "Array" = "Array"
  constructor(
    readonly span: Span,
    readonly item: TypeAnnotation,
  ) {}
}
export class ReadonlyArrayTypeAnnotation {
  readonly kind: "ReadonlyArray" = "ReadonlyArray"
  constructor(
    readonly span: Span,
    readonly item: TypeAnnotation,
  ) {}
}
export class ApplicationTypeAnnotation {
  readonly kind: "Application" = "Application"
  constructor(
    readonly span: Span,
    readonly callee: TypeAnnotation,
    readonly args: readonly TypeAnnotation[],
  ) {}
}
export class StringTypeAnnotation {
  readonly kind: "String" = "String"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class FuncTypeAnnotation {
  readonly kind: "Func" = "Func"
  constructor(
    readonly span: Span,
    readonly type_params: readonly TypeParam[],
    readonly params: readonly FuncTypeParam[],
    readonly returns: TypeAnnotation,
  ) {}
}
export class LJSConstPtrTypeAnnotation {
  readonly kind: "LJSConstPtr" = "LJSConstPtr"
  constructor(
    readonly span: Span,
    readonly to: TypeAnnotation,
  ) {}
}
export class LJSPtrTypeAnnotation {
  readonly kind: "LJSPtr" = "LJSPtr"
  constructor(
    readonly span: Span,
    readonly to: TypeAnnotation,
  ) {}
}

export const TypeAnnotation = {
  Ident: (span: Span, ident: Ident): IdentTypeAnnotation =>
    new IdentTypeAnnotation(span, ident),

  Union: (
    span: Span,
    left: TypeAnnotation,
    right: TypeAnnotation,
  ): UnionTypeAnnotation => new UnionTypeAnnotation(span, left, right),

  Array: (span: Span, item: TypeAnnotation): ArrayTypeAnnotation =>
    new ArrayTypeAnnotation(span, item),

  ReadonlyArray: (
    span: Span,
    item: TypeAnnotation,
  ): ReadonlyArrayTypeAnnotation => new ReadonlyArrayTypeAnnotation(span, item),

  Application: (
    span: Span,
    callee: TypeAnnotation,
    args: readonly TypeAnnotation[],
  ): ApplicationTypeAnnotation =>
    new ApplicationTypeAnnotation(span, callee, args),

  String: (span: Span, text: Text): StringTypeAnnotation =>
    new StringTypeAnnotation(span, text),

  Func: (
    span: Span,
    type_params: readonly TypeParam[],
    params: readonly FuncTypeParam[],
    returns: TypeAnnotation,
  ): FuncTypeAnnotation =>
    new FuncTypeAnnotation(span, type_params, params, returns),

  LJSConstPtr: (span: Span, to: TypeAnnotation): LJSConstPtrTypeAnnotation =>
    new LJSConstPtrTypeAnnotation(span, to),

  LJSPtr: (span: Span, to: TypeAnnotation): LJSPtrTypeAnnotation =>
    new LJSPtrTypeAnnotation(span, to),
} as const

export interface LJSExternFunction {
  readonly span: Span
  readonly is_exported: boolean
  readonly name: Ident
  readonly params: readonly Param[]
  readonly return_type: TypeAnnotation
}

export interface FuncTypeParam {
  readonly label: Ident
  readonly type_annotation: TypeAnnotation
}

export type ObjectLiteralEntry =
  | IdentObjectLiteralEntry
  | PropObjectLiteralEntry
  | MethodObjectLiteralEntry
  | SpreadObjectLiteralEntry
export class IdentObjectLiteralEntry {
  readonly kind: "Ident" = "Ident"
  constructor(
    readonly span: Span,
    readonly ident: Ident,
  ) {}
}
export class PropObjectLiteralEntry {
  readonly kind: "Prop" = "Prop"
  constructor(
    readonly span: Span,
    readonly key: ObjectKey,
    readonly value: Expr,
  ) {}
}
export class MethodObjectLiteralEntry {
  readonly kind: "Method" = "Method"
  constructor(
    readonly span: Span,
    readonly method: MethodDef,
  ) {}
}
export class SpreadObjectLiteralEntry {
  readonly kind: "Spread" = "Spread"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}

export const ObjectLiteralEntry = {
  Ident: (span: Span, ident: Ident): IdentObjectLiteralEntry =>
    new IdentObjectLiteralEntry(span, ident),

  Prop: (span: Span, key: ObjectKey, value: Expr): PropObjectLiteralEntry =>
    new PropObjectLiteralEntry(span, key, value),

  Method: (span: Span, method: MethodDef): MethodObjectLiteralEntry =>
    new MethodObjectLiteralEntry(span, method),

  Spread: (span: Span, expr: Expr): SpreadObjectLiteralEntry =>
    new SpreadObjectLiteralEntry(span, expr),
} as const

export type ObjectKey = IdentObjectKey | StringObjectKey | ComputedObjectKey
export class IdentObjectKey {
  readonly kind: "Ident" = "Ident"
  constructor(
    readonly span: Span,
    readonly ident: Ident,
  ) {}
}
export class StringObjectKey {
  readonly kind: "String" = "String"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class ComputedObjectKey {
  readonly kind: "Computed" = "Computed"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}

export const ObjectKey = {
  Ident: (span: Span, ident: Ident): IdentObjectKey =>
    new IdentObjectKey(span, ident),

  String: (span: Span, text: Text): StringObjectKey =>
    new StringObjectKey(span, text),

  Computed: (span: Span, expr: Expr): ComputedObjectKey =>
    new ComputedObjectKey(span, expr),
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
  | ExprArrayLiteralMember
  | ElisionArrayLiteralMember
  | SpreadArrayLiteralMember
export class ExprArrayLiteralMember {
  readonly kind: "Expr" = "Expr"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class ElisionArrayLiteralMember {
  readonly kind: "Elision" = "Elision"
  constructor(readonly span: Span) {}
}
export class SpreadArrayLiteralMember {
  readonly kind: "Spread" = "Spread"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}

export const ArrayLiteralMember = {
  Expr: (span: Span, expr: Expr): ExprArrayLiteralMember =>
    new ExprArrayLiteralMember(span, expr),

  Elision: (span: Span): ElisionArrayLiteralMember =>
    new ElisionArrayLiteralMember(span),

  Spread: (span: Span, expr: Expr): SpreadArrayLiteralMember =>
    new SpreadArrayLiteralMember(span, expr),
} as const

export type ArrowFnBody = ExprArrowFnBody | BlockArrowFnBody
export class ExprArrowFnBody {
  readonly kind: "Expr" = "Expr"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}
export class BlockArrowFnBody {
  readonly kind: "Block" = "Block"
  constructor(
    readonly span: Span,
    readonly block: Block,
  ) {}
}

export const ArrowFnBody = {
  Expr: (span: Span, expr: Expr): ExprArrowFnBody =>
    new ExprArrowFnBody(span, expr),

  Block: (span: Span, block: Block): BlockArrowFnBody =>
    new BlockArrowFnBody(span, block),
} as const

export type TemplateLiteralFragment =
  | TextTemplateLiteralFragment
  | ExprTemplateLiteralFragment
export class TextTemplateLiteralFragment {
  readonly kind: "Text" = "Text"
  constructor(
    readonly span: Span,
    readonly text: Text,
  ) {}
}
export class ExprTemplateLiteralFragment {
  readonly kind: "Expr" = "Expr"
  constructor(
    readonly span: Span,
    readonly expr: Expr,
  ) {}
}

export const TemplateLiteralFragment = {
  Text: (span: Span, text: Text): TextTemplateLiteralFragment =>
    new TextTemplateLiteralFragment(span, text),

  Expr: (span: Span, expr: Expr): ExprTemplateLiteralFragment =>
    new ExprTemplateLiteralFragment(span, expr),
} as const

export interface ObjectPatternProperty {
  readonly span: Span
  readonly key: ObjectKey
  readonly value: Pattern
}

export type ModuleExportName = IdentModuleExportName | StringModuleExportName
export class IdentModuleExportName {
  readonly kind: "Ident" = "Ident"
  constructor(readonly ident: Ident) {}
}
export class StringModuleExportName {
  readonly kind: "String" = "String"
  constructor(readonly text: Text) {}
}

export const ModuleExportName = {
  Ident: (ident: Ident): IdentModuleExportName =>
    new IdentModuleExportName(ident),

  String: (text: Text): StringModuleExportName =>
    new StringModuleExportName(text),
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
  | "Exponent"
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
  Exponent: "Exponent",
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
