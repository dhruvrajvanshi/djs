// This file is generated automatically
// DO NOT EDIT
// node djs_ast/gen_ts_ast.js | pnpm prettier > src/ast.gen.ts

import type { Span } from "./Span.js";

export interface SourceFile {
  readonly span: Span;
  readonly stmts: readonly Stmt[];
}

export interface Text {
  readonly span: Span;
  readonly text: string;
}

export type Stmt =
  | {
      readonly kind: "Expr";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Block";
      readonly block: Block;
    }
  | {
      readonly kind: "Return";
      readonly value: Expr | null;
    }
  | {
      readonly kind: "VarDecl";
      readonly decl: VarDecl;
    }
  | {
      readonly kind: "If";
      readonly condition: Expr;
      readonly if_true: Stmt;
      readonly if_false: Stmt | null;
    }
  | {
      readonly kind: "Switch";
      readonly condition: Expr;
      readonly cases: readonly SwitchCase[];
    }
  | {
      readonly kind: "While";
      readonly condition: Expr;
      readonly body: Stmt;
    }
  | {
      readonly kind: "DoWhile";
      readonly body: Stmt;
      readonly condition: Expr;
    }
  | {
      readonly kind: "Try";
      readonly try_block: Block;
      readonly catch_pattern: Pattern | null;
      readonly catch_block: Block | null;
      readonly finally_block: Block | null;
    }
  | {
      readonly kind: "For";
      readonly init: ForInit;
      readonly test: Expr | null;
      readonly update: Expr | null;
      readonly body: Stmt;
    }
  | {
      readonly kind: "ForInOrOf";
      readonly decl_type: DeclType | null;
      readonly lhs: Pattern;
      readonly in_or_of: InOrOf;
      readonly rhs: Expr;
      readonly body: Stmt;
    }
  | {
      readonly kind: "Break";
      readonly label: Label | null;
    }
  | {
      readonly kind: "Continue";
      readonly label: Label | null;
    }
  | {
      readonly kind: "Debugger";
    }
  | {
      readonly kind: "With";
      readonly expr: Expr;
      readonly body: Stmt;
    }
  | {
      readonly kind: "Func";
      readonly func: Func;
    }
  | {
      readonly kind: "ClassDecl";
      readonly class: Class;
    }
  | {
      readonly kind: "Empty";
    };

export interface Class {
  readonly span: Span;
  readonly name: Ident | null;
  readonly superclass: Expr | null;
  readonly body: ClassBody;
}

export interface Block {
  readonly span: Span;
  readonly stmts: readonly Stmt[];
}

export interface ClassBody {
  readonly span: Span;
  readonly members: readonly ClassMember[];
}

export interface MethodDef {
  readonly span: Span;
  readonly name: ObjectKey;
  readonly body: Func;
  readonly accessor_type: AccessorType | null;
}

export type ClassMember =
  | {
      readonly kind: "MethodDef";
      readonly method: MethodDef;
    }
  | {
      readonly kind: "FieldDef";
      readonly field: FieldDef;
    };

export interface FieldDef {
  readonly span: Span;
  readonly name: Ident;
  readonly initializer: Expr | null;
}

export interface Ident {
  readonly span: Span;
  readonly text: string;
}

export type Pattern =
  | {
      readonly kind: "Var";
      readonly ident: Ident;
    }
  | {
      readonly kind: "Assignment";
      readonly pattern: Pattern;
      readonly initializer: Expr;
    }
  | {
      readonly kind: "Array";
      readonly items: readonly Pattern[];
    }
  | {
      readonly kind: "Object";
      readonly properties: readonly ObjectPatternProperty[];
      readonly rest: Pattern | null;
    }
  | {
      readonly kind: "Prop";
      readonly expr: Expr;
      readonly key: ObjectKey;
    }
  | {
      readonly kind: "Elision";
    }
  | {
      readonly kind: "Rest";
      readonly pattern: Pattern;
    };

export interface Label {
  readonly span: Span;
  readonly name: string;
}

export interface SwitchCase {
  readonly span: Span;
  readonly test: Expr | null;
  readonly body: readonly Stmt[];
}

export type InOrOf = "In" | "Of";

export interface VarDecl {
  readonly span: Span;
  readonly decl_type: DeclType;
  readonly declarators: readonly VarDeclarator[];
}

export interface VarDeclarator {
  readonly pattern: Pattern;
  readonly init: Expr | null;
}

export type ForInit =
  | {
      readonly kind: "VarDecl";
      readonly decl: VarDecl;
    }
  | {
      readonly kind: "Expr";
      readonly expr: Expr;
    };
export type Expr =
  | {
      readonly kind: "Var";
      readonly ident: Ident;
    }
  | {
      readonly kind: "BinOp";
      readonly lhs: Expr;
      readonly operator: BinOp;
      readonly rhs: Expr;
    }
  | {
      readonly kind: "ArrowFn";
      readonly params: ParamList;
      readonly body: ArrowFnBody;
    }
  | {
      readonly kind: "Func";
      readonly func: Func;
    }
  | {
      readonly kind: "Call";
      readonly callee: Expr;
      readonly args: readonly Expr[];
    }
  | {
      readonly kind: "Index";
      readonly lhs: Expr;
      readonly property: Expr;
    }
  | {
      readonly kind: "Prop";
      readonly lhs: Expr;
      readonly property: Ident;
    }
  | {
      readonly kind: "String";
      readonly text: Text;
    }
  | {
      readonly kind: "Number";
      readonly text: Text;
    }
  | {
      readonly kind: "Boolean";
      readonly value: boolean;
    }
  | {
      readonly kind: "Null";
    }
  | {
      readonly kind: "Undefined";
    }
  | {
      readonly kind: "Object";
      readonly entries: readonly ObjectLiteralEntry[];
    }
  | {
      readonly kind: "Throw";
      readonly value: Expr;
    }
  | {
      readonly kind: "PostIncrement";
      readonly value: Expr;
    }
  | {
      readonly kind: "PostDecrement";
      readonly value: Expr;
    }
  | {
      readonly kind: "PreIncrement";
      readonly value: Expr;
    }
  | {
      readonly kind: "PreDecrement";
      readonly value: Expr;
    }
  | {
      readonly kind: "Array";
      readonly items: readonly ArrayLiteralMember[];
    }
  | {
      readonly kind: "New";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Yield";
      readonly value: Expr | null;
    }
  | {
      readonly kind: "YieldFrom";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Ternary";
      readonly condition: Expr;
      readonly if_true: Expr;
      readonly if_false: Expr;
    }
  | {
      readonly kind: "Assign";
      readonly pattern: Pattern;
      readonly operator: AssignOp;
      readonly value: Expr;
    }
  | {
      readonly kind: "Regex";
      readonly text: Text;
    }
  | {
      readonly kind: "Delete";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Void";
      readonly expr: Expr;
    }
  | {
      readonly kind: "TypeOf";
      readonly expr: Expr;
    }
  | {
      readonly kind: "UnaryPlus";
      readonly expr: Expr;
    }
  | {
      readonly kind: "UnaryMinus";
      readonly expr: Expr;
    }
  | {
      readonly kind: "BitNot";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Not";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Await";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Comma";
      readonly items: readonly Expr[];
    }
  | {
      readonly kind: "Super";
    }
  | {
      readonly kind: "Class";
      readonly class: Class;
    }
  | {
      readonly kind: "TemplateLiteral";
      readonly fragments: readonly TemplateLiteralFragment[];
    };
export type ObjectLiteralEntry =
  | {
      readonly kind: "Ident";
      readonly ident: Ident;
    }
  | {
      readonly kind: "Prop";
      readonly key: ObjectKey;
      readonly value: Expr;
    }
  | {
      readonly kind: "Method";
      readonly method: MethodDef;
    }
  | {
      readonly kind: "Spread";
      readonly expr: Expr;
    };
export type ObjectKey =
  | {
      readonly kind: "Ident";
      readonly ident: Ident;
    }
  | {
      readonly kind: "String";
      readonly text: Text;
    }
  | {
      readonly kind: "Computed";
      readonly expr: Expr;
    };

export interface ParamList {
  readonly span: Span;
  readonly params: readonly Param[];
}

export interface Param {
  readonly span: Span;
  readonly pattern: Pattern;
}

export interface Func {
  readonly span: Span;
  readonly name: Ident | null;
  readonly params: ParamList;
  readonly body: Block;
  readonly is_generator: boolean;
  readonly is_async: boolean;
}

export type ArrayLiteralMember =
  | {
      readonly kind: "Expr";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Elision";
    }
  | {
      readonly kind: "Spread";
      readonly expr: Expr;
    };
export type ArrowFnBody =
  | {
      readonly kind: "Expr";
      readonly expr: Expr;
    }
  | {
      readonly kind: "Block";
      readonly block: Block;
    };
export type TemplateLiteralFragment =
  | {
      readonly kind: "Text";
      readonly text: Text;
    }
  | {
      readonly kind: "Expr";
      readonly expr: Expr;
    };

export interface ObjectPatternProperty {
  readonly span: Span;
  readonly key: ObjectKey;
  readonly value: Pattern;
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
  | "UnsignedRightShift";
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
  | "ExponentEq";
export type DeclType = "Let" | "Const" | "Var";
export type AccessorType = "Get" | "Set";
