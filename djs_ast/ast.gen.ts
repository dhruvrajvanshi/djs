// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.ts"
import type { Diagnostic } from "./Diagnostic.ts"
import {
  expr_to_sexpr,
  stmt_to_sexpr,
  type_annotation_to_sexpr,
  pattern_to_sexpr,
  sexpr_to_string,
} from "./sexpr.ts"

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
  | ImportStarAsStmt
  | LabeledStmt
  | ObjectTypeDeclStmt
  | TypeAliasStmt
  | LJSExternFunctionStmt
  | EmptyStmt
export class ExprStmt {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Expr" {
    return "Expr"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class BlockStmt {
  constructor(
    readonly span: Span,

    readonly block: Block,
  ) {}

  get kind(): "Block" {
    return "Block"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ReturnStmt {
  constructor(
    readonly span: Span,

    readonly value: Expr | null,
  ) {}

  get kind(): "Return" {
    return "Return"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class VarDeclStmt {
  constructor(
    readonly span: Span,

    readonly decl: VarDecl,
  ) {}

  get kind(): "VarDecl" {
    return "VarDecl"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class IfStmt {
  constructor(
    readonly span: Span,

    readonly condition: Expr,
    readonly if_true: Stmt,
    readonly if_false: Stmt | null,
  ) {}

  get kind(): "If" {
    return "If"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class SwitchStmt {
  constructor(
    readonly span: Span,

    readonly condition: Expr,
    readonly cases: readonly SwitchCase[],
  ) {}

  get kind(): "Switch" {
    return "Switch"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class WhileStmt {
  constructor(
    readonly span: Span,

    readonly condition: Expr,
    readonly body: Stmt,
  ) {}

  get kind(): "While" {
    return "While"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class DoWhileStmt {
  constructor(
    readonly span: Span,

    readonly body: Stmt,
    readonly condition: Expr,
  ) {}

  get kind(): "DoWhile" {
    return "DoWhile"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class TryStmt {
  constructor(
    readonly span: Span,

    readonly try_block: Block,
    readonly catch_pattern: Pattern | null,
    readonly catch_block: Block | null,
    readonly finally_block: Block | null,
  ) {}

  get kind(): "Try" {
    return "Try"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ForStmt {
  constructor(
    readonly span: Span,

    readonly init: ForInit,
    readonly test: Expr | null,
    readonly update: Expr | null,
    readonly body: Stmt,
  ) {}

  get kind(): "For" {
    return "For"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ForInOrOfStmt {
  constructor(
    readonly span: Span,

    readonly decl_type: DeclType | null,
    readonly lhs: Pattern,
    readonly in_or_of: InOrOf,
    readonly rhs: Expr,
    readonly body: Stmt,
  ) {}

  get kind(): "ForInOrOf" {
    return "ForInOrOf"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class BreakStmt {
  constructor(
    readonly span: Span,

    readonly label: Label | null,
  ) {}

  get kind(): "Break" {
    return "Break"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ContinueStmt {
  constructor(
    readonly span: Span,

    readonly label: Label | null,
  ) {}

  get kind(): "Continue" {
    return "Continue"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class DebuggerStmt {
  constructor(readonly span: Span) {}

  get kind(): "Debugger" {
    return "Debugger"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class WithStmt {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
    readonly body: Stmt,
  ) {}

  get kind(): "With" {
    return "With"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class FuncStmt {
  constructor(
    readonly span: Span,

    readonly func: Func,
    readonly is_exported: boolean,
  ) {}

  get kind(): "Func" {
    return "Func"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ClassDeclStmt {
  constructor(
    readonly span: Span,

    readonly class_def: Class,
  ) {}

  get kind(): "ClassDecl" {
    return "ClassDecl"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ImportStmt {
  constructor(
    readonly span: Span,

    readonly default_import: Ident | null,
    readonly named_imports: readonly ImportSpecifier[],
    readonly module_specifier: Text,
  ) {}

  get kind(): "Import" {
    return "Import"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ImportStarAsStmt {
  constructor(
    readonly span: Span,

    readonly as_name: Ident,
    readonly module_specifier: Text,
  ) {}

  get kind(): "ImportStarAs" {
    return "ImportStarAs"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class LabeledStmt {
  constructor(
    readonly span: Span,

    readonly label: Label,
    readonly stmt: Stmt,
  ) {}

  get kind(): "Labeled" {
    return "Labeled"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class ObjectTypeDeclStmt {
  constructor(
    readonly span: Span,

    readonly name: Ident,
    readonly fields: readonly ObjectTypeDeclField[],
  ) {}

  get kind(): "ObjectTypeDecl" {
    return "ObjectTypeDecl"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class TypeAliasStmt {
  constructor(
    readonly span: Span,

    readonly name: Ident,
    readonly type_annotation: TypeAnnotation,
  ) {}

  get kind(): "TypeAlias" {
    return "TypeAlias"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class LJSExternFunctionStmt {
  constructor(
    readonly span: Span,

    readonly is_exported: boolean,
    readonly name: Ident,
    readonly params: readonly Param[],
    readonly return_type: TypeAnnotation,
  ) {}

  get kind(): "LJSExternFunction" {
    return "LJSExternFunction"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
}
export class EmptyStmt {
  constructor(readonly span: Span) {}

  get kind(): "Empty" {
    return "Empty"
  }

  toString(): string {
    return sexpr_to_string(stmt_to_sexpr(this))
  }
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

  Func: (span: Span, func: Func, is_exported: boolean): FuncStmt =>
    new FuncStmt(span, func, is_exported),

  ClassDecl: (span: Span, class_def: Class): ClassDeclStmt =>
    new ClassDeclStmt(span, class_def),

  Import: (
    span: Span,
    default_import: Ident | null,
    named_imports: readonly ImportSpecifier[],
    module_specifier: Text,
  ): ImportStmt =>
    new ImportStmt(span, default_import, named_imports, module_specifier),

  ImportStarAs: (
    span: Span,
    as_name: Ident,
    module_specifier: Text,
  ): ImportStarAsStmt => new ImportStarAsStmt(span, as_name, module_specifier),

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
    is_exported: boolean,
    name: Ident,
    params: readonly Param[],
    return_type: TypeAnnotation,
  ): LJSExternFunctionStmt =>
    new LJSExternFunctionStmt(span, is_exported, name, params, return_type),

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
  constructor(readonly method: MethodDef) {}

  get kind(): "MethodDef" {
    return "MethodDef"
  }
}
export class FieldDefClassMember {
  constructor(readonly field: FieldDef) {}

  get kind(): "FieldDef" {
    return "FieldDef"
  }
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
  constructor(
    readonly span: Span,

    readonly ident: Ident,
  ) {}

  get kind(): "Var" {
    return "Var"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class AssignmentPattern {
  constructor(
    readonly span: Span,

    readonly pattern: Pattern,
    readonly initializer: Expr,
  ) {}

  get kind(): "Assignment" {
    return "Assignment"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class ArrayPattern {
  constructor(
    readonly span: Span,

    readonly items: readonly Pattern[],
  ) {}

  get kind(): "Array" {
    return "Array"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class ObjectPattern {
  constructor(
    readonly span: Span,

    readonly properties: readonly ObjectPatternProperty[],
    readonly rest: Pattern | null,
  ) {}

  get kind(): "Object" {
    return "Object"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class PropPattern {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
    readonly key: ObjectKey,
  ) {}

  get kind(): "Prop" {
    return "Prop"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class ElisionPattern {
  constructor(readonly span: Span) {}

  get kind(): "Elision" {
    return "Elision"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
}
export class RestPattern {
  constructor(
    readonly span: Span,

    readonly pattern: Pattern,
  ) {}

  get kind(): "Rest" {
    return "Rest"
  }

  toString(): string {
    return sexpr_to_string(pattern_to_sexpr(this))
  }
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
  constructor(readonly decl: VarDecl) {}

  get kind(): "VarDecl" {
    return "VarDecl"
  }
}
export class ExprForInit {
  constructor(readonly expr: Expr) {}

  get kind(): "Expr" {
    return "Expr"
  }
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
  | BuiltinExpr
export class VarExpr {
  constructor(
    readonly span: Span,

    readonly leading_trivia: Text,
    readonly ident: Ident,
  ) {}

  get kind(): "Var" {
    return "Var"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ParenExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Paren" {
    return "Paren"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class BinOpExpr {
  constructor(
    readonly span: Span,

    readonly lhs: Expr,
    readonly operator: BinOp,
    readonly rhs: Expr,
  ) {}

  get kind(): "BinOp" {
    return "BinOp"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ArrowFnExpr {
  constructor(
    readonly span: Span,

    readonly params: readonly Param[],
    readonly return_type: TypeAnnotation | null,
    readonly body: ArrowFnBody,
  ) {}

  get kind(): "ArrowFn" {
    return "ArrowFn"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class FuncExpr {
  constructor(
    readonly span: Span,

    readonly func: Func,
  ) {}

  get kind(): "Func" {
    return "Func"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class CallExpr {
  constructor(
    readonly span: Span,

    readonly callee: Expr,
    readonly args: readonly Expr[],
    readonly spread: Expr | null,
    readonly is_optional: boolean,
  ) {}

  get kind(): "Call" {
    return "Call"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class IndexExpr {
  constructor(
    readonly span: Span,

    readonly lhs: Expr,
    readonly property: Expr,
    readonly is_optional: boolean,
  ) {}

  get kind(): "Index" {
    return "Index"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class PropExpr {
  constructor(
    readonly span: Span,

    readonly lhs: Expr,
    readonly property: Ident,
    readonly is_optional: boolean,
  ) {}

  get kind(): "Prop" {
    return "Prop"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class StringExpr {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "String" {
    return "String"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class NumberExpr {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "Number" {
    return "Number"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class BooleanExpr {
  constructor(
    readonly span: Span,

    readonly value: boolean,
  ) {}

  get kind(): "Boolean" {
    return "Boolean"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class NullExpr {
  constructor(readonly span: Span) {}

  get kind(): "Null" {
    return "Null"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class UndefinedExpr {
  constructor(readonly span: Span) {}

  get kind(): "Undefined" {
    return "Undefined"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ObjectExpr {
  constructor(
    readonly span: Span,

    readonly entries: readonly ObjectLiteralEntry[],
  ) {}

  get kind(): "Object" {
    return "Object"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ThrowExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr,
  ) {}

  get kind(): "Throw" {
    return "Throw"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class PostIncrementExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr,
  ) {}

  get kind(): "PostIncrement" {
    return "PostIncrement"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class PostDecrementExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr,
  ) {}

  get kind(): "PostDecrement" {
    return "PostDecrement"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class PreIncrementExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr,
  ) {}

  get kind(): "PreIncrement" {
    return "PreIncrement"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class PreDecrementExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr,
  ) {}

  get kind(): "PreDecrement" {
    return "PreDecrement"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ArrayExpr {
  constructor(
    readonly span: Span,

    readonly items: readonly ArrayLiteralMember[],
  ) {}

  get kind(): "Array" {
    return "Array"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class NewExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "New" {
    return "New"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class YieldExpr {
  constructor(
    readonly span: Span,

    readonly value: Expr | null,
  ) {}

  get kind(): "Yield" {
    return "Yield"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class YieldFromExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "YieldFrom" {
    return "YieldFrom"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class TernaryExpr {
  constructor(
    readonly span: Span,

    readonly condition: Expr,
    readonly if_true: Expr,
    readonly if_false: Expr,
  ) {}

  get kind(): "Ternary" {
    return "Ternary"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class AssignExpr {
  constructor(
    readonly span: Span,

    readonly pattern: Pattern,
    readonly operator: AssignOp,
    readonly value: Expr,
  ) {}

  get kind(): "Assign" {
    return "Assign"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class RegexExpr {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "Regex" {
    return "Regex"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class DeleteExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Delete" {
    return "Delete"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class VoidExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Void" {
    return "Void"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class TypeOfExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "TypeOf" {
    return "TypeOf"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class UnaryPlusExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "UnaryPlus" {
    return "UnaryPlus"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class UnaryMinusExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "UnaryMinus" {
    return "UnaryMinus"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class BitNotExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "BitNot" {
    return "BitNot"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class NotExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Not" {
    return "Not"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class AwaitExpr {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Await" {
    return "Await"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class CommaExpr {
  constructor(
    readonly span: Span,

    readonly items: readonly Expr[],
  ) {}

  get kind(): "Comma" {
    return "Comma"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class SuperExpr {
  constructor(readonly span: Span) {}

  get kind(): "Super" {
    return "Super"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class ClassExpr {
  constructor(
    readonly span: Span,

    readonly class_def: Class,
  ) {}

  get kind(): "Class" {
    return "Class"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class TemplateLiteralExpr {
  constructor(
    readonly span: Span,

    readonly fragments: readonly TemplateLiteralFragment[],
  ) {}

  get kind(): "TemplateLiteral" {
    return "TemplateLiteral"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class TaggedTemplateLiteralExpr {
  constructor(
    readonly span: Span,

    readonly tag: Expr,
    readonly fragments: readonly TemplateLiteralFragment[],
  ) {}

  get kind(): "TaggedTemplateLiteral" {
    return "TaggedTemplateLiteral"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}
export class BuiltinExpr {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "Builtin" {
    return "Builtin"
  }

  toString(): string {
    return sexpr_to_string(expr_to_sexpr(this))
  }
}

export const Expr = {
  Var: (span: Span, leading_trivia: Text, ident: Ident): VarExpr =>
    new VarExpr(span, leading_trivia, ident),

  Paren: (span: Span, expr: Expr): ParenExpr => new ParenExpr(span, expr),

  BinOp: (span: Span, lhs: Expr, operator: BinOp, rhs: Expr): BinOpExpr =>
    new BinOpExpr(span, lhs, operator, rhs),

  ArrowFn: (
    span: Span,
    params: readonly Param[],
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

  Class: (span: Span, class_def: Class): ClassExpr =>
    new ClassExpr(span, class_def),

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

  Builtin: (span: Span, text: Text): BuiltinExpr => new BuiltinExpr(span, text),
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
  | LJSMutPtrTypeAnnotation
  | LJSPtrTypeAnnotation
  | BuiltinTypeAnnotation
  | QualifiedTypeAnnotation
export class IdentTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly leading_trivia: Text,
    readonly ident: Ident,
  ) {}

  get kind(): "Ident" {
    return "Ident"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class UnionTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly left: TypeAnnotation,
    readonly right: TypeAnnotation,
  ) {}

  get kind(): "Union" {
    return "Union"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class ArrayTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly item: TypeAnnotation,
  ) {}

  get kind(): "Array" {
    return "Array"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class ReadonlyArrayTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly item: TypeAnnotation,
  ) {}

  get kind(): "ReadonlyArray" {
    return "ReadonlyArray"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class ApplicationTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly callee: TypeAnnotation,
    readonly args: readonly TypeAnnotation[],
  ) {}

  get kind(): "Application" {
    return "Application"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class StringTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "String" {
    return "String"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class FuncTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly type_params: readonly TypeParam[],
    readonly params: readonly FuncTypeParam[],
    readonly returns: TypeAnnotation,
  ) {}

  get kind(): "Func" {
    return "Func"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class LJSMutPtrTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly to: TypeAnnotation,
  ) {}

  get kind(): "LJSMutPtr" {
    return "LJSMutPtr"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class LJSPtrTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly to: TypeAnnotation,
  ) {}

  get kind(): "LJSPtr" {
    return "LJSPtr"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class BuiltinTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "Builtin" {
    return "Builtin"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}
export class QualifiedTypeAnnotation {
  constructor(
    readonly span: Span,

    readonly head: Ident,
    readonly tail: readonly Ident[],
  ) {}

  get kind(): "Qualified" {
    return "Qualified"
  }

  toString(): string {
    return sexpr_to_string(type_annotation_to_sexpr(this))
  }
}

export const TypeAnnotation = {
  Ident: (
    span: Span,
    leading_trivia: Text,
    ident: Ident,
  ): IdentTypeAnnotation =>
    new IdentTypeAnnotation(span, leading_trivia, ident),

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

  LJSMutPtr: (span: Span, to: TypeAnnotation): LJSMutPtrTypeAnnotation =>
    new LJSMutPtrTypeAnnotation(span, to),

  LJSPtr: (span: Span, to: TypeAnnotation): LJSPtrTypeAnnotation =>
    new LJSPtrTypeAnnotation(span, to),

  Builtin: (span: Span, text: Text): BuiltinTypeAnnotation =>
    new BuiltinTypeAnnotation(span, text),

  Qualified: (
    span: Span,
    head: Ident,
    tail: readonly Ident[],
  ): QualifiedTypeAnnotation => new QualifiedTypeAnnotation(span, head, tail),
} as const

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
  constructor(
    readonly span: Span,

    readonly ident: Ident,
  ) {}

  get kind(): "Ident" {
    return "Ident"
  }
}
export class PropObjectLiteralEntry {
  constructor(
    readonly span: Span,

    readonly key: ObjectKey,
    readonly value: Expr,
  ) {}

  get kind(): "Prop" {
    return "Prop"
  }
}
export class MethodObjectLiteralEntry {
  constructor(
    readonly span: Span,

    readonly method: MethodDef,
  ) {}

  get kind(): "Method" {
    return "Method"
  }
}
export class SpreadObjectLiteralEntry {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Spread" {
    return "Spread"
  }
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
  constructor(
    readonly span: Span,

    readonly ident: Ident,
  ) {}

  get kind(): "Ident" {
    return "Ident"
  }
}
export class StringObjectKey {
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "String" {
    return "String"
  }
}
export class ComputedObjectKey {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Computed" {
    return "Computed"
  }
}

export const ObjectKey = {
  Ident: (span: Span, ident: Ident): IdentObjectKey =>
    new IdentObjectKey(span, ident),

  String: (span: Span, text: Text): StringObjectKey =>
    new StringObjectKey(span, text),

  Computed: (span: Span, expr: Expr): ComputedObjectKey =>
    new ComputedObjectKey(span, expr),
} as const

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
  readonly params: readonly Param[]
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
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Expr" {
    return "Expr"
  }
}
export class ElisionArrayLiteralMember {
  constructor(readonly span: Span) {}

  get kind(): "Elision" {
    return "Elision"
  }
}
export class SpreadArrayLiteralMember {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Spread" {
    return "Spread"
  }
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
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Expr" {
    return "Expr"
  }
}
export class BlockArrowFnBody {
  constructor(
    readonly span: Span,

    readonly block: Block,
  ) {}

  get kind(): "Block" {
    return "Block"
  }
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
  constructor(
    readonly span: Span,

    readonly text: Text,
  ) {}

  get kind(): "Text" {
    return "Text"
  }
}
export class ExprTemplateLiteralFragment {
  constructor(
    readonly span: Span,

    readonly expr: Expr,
  ) {}

  get kind(): "Expr" {
    return "Expr"
  }
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
  constructor(readonly ident: Ident) {}

  get kind(): "Ident" {
    return "Ident"
  }
}
export class StringModuleExportName {
  constructor(readonly text: Text) {}

  get kind(): "String" {
    return "String"
  }
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
