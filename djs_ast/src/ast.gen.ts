// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.js"

export interface SourceFile {
  readonly span: Span
  readonly stmts: readonly Stmt[]
}

export interface Text {
  readonly span: Span
  readonly text: string
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
      readonly kind: "Empty"
      readonly span: Span
    }

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

export interface VarDecl {
  readonly span: Span
  readonly decl_type: DeclType
  readonly declarators: readonly VarDeclarator[]
}

export interface VarDeclarator {
  readonly pattern: Pattern
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

export interface ParamList {
  readonly span: Span
  readonly params: readonly Param[]
}

export interface Param {
  readonly span: Span
  readonly pattern: Pattern
}

export interface Func {
  readonly span: Span
  readonly name: Ident | null
  readonly params: ParamList
  readonly body: Block
  readonly is_generator: boolean
  readonly is_async: boolean
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

export interface ObjectPatternProperty {
  readonly span: Span
  readonly key: ObjectKey
  readonly value: Pattern
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
export type DeclType = "Let" | "Const" | "Var"
export type AccessorType = "Get" | "Set"
