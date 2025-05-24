import type {
  Block,
  Expr,
  Func,
  SourceFile,
  Stmt,
  TypeAnnotation,
} from "./ast.gen.ts"

export interface ASTVisitor extends BaseASTVisitor {}

export class BaseASTVisitor {
  visit_source_file(source_file: SourceFile): void {
    walk_source_file(this, source_file)
  }
  visit_stmt(stmt: Stmt): void {
    walk_stmt(this, stmt)
  }

  visit_ljs_extern_stmt(stmt: StmtT<"LJSExternFunction">): void {
    walk_ljs_extern_stmt(this, stmt)
  }
  visit_expr_stmt(stmt: StmtT<"Expr">): void {
    this.visit_expr(stmt.expr)
  }
  visit_expr(expr: Expr): void {
    walk_expr(this, expr)
  }
  visit_call_expr(expr: ExprT<"Call">): void {
    walk_call_expr(this, expr)
  }
  visit_var_expr(_: ExprT<"Var">): void {}
  visit_tagged_template_literal(expr: ExprT<"TaggedTemplateLiteral">): void {
    walk_tagged_template_literal(this, expr)
  }

  visit_type_annotation(type_annotation: TypeAnnotation): void {
    walk_type_annotation(this, type_annotation)
  }
  visit_ljs_const_ptr(annotation: AnnotationT<"LJSConstPtr">): void {
    this.visit_type_annotation(annotation.to)
  }
  visit_ljs_ptr(annotation: AnnotationT<"LJSPtr">): void {
    this.visit_type_annotation(annotation.to)
  }
  visit_ident_type_annotation(_: AnnotationT<"Ident">): void {}

  visit_func_stmt(stmt: StmtT<"Func">): void {
    this.visit_func(stmt.func)
  }

  visit_func(func: Func): void {
    walk_func(this, func)
  }
  visit_block(block: Block): void {
    walk_block(this, block)
  }
}
type StmtT<T extends Stmt["kind"]> = Extract<Stmt, { kind: T }>
type AnnotationT<T extends TypeAnnotation["kind"]> = Extract<
  TypeAnnotation,
  { kind: T }
>
type ExprT<T extends Expr["kind"]> = Extract<Expr, { kind: T }>

function walk_stmt(visitor: ASTVisitor, stmt: Stmt): void {
  switch (stmt.kind) {
    case "LJSExternFunction":
      visitor.visit_ljs_extern_stmt(stmt)
      break
    case "Func":
      visitor.visit_func_stmt(stmt)
      break
    case "Expr":
      visitor.visit_expr_stmt(stmt)
      break
    default:
      todo(`Unhandled statement kind: ${stmt.kind}`)
  }
}
function walk_ljs_extern_stmt(
  visitor: ASTVisitor,
  stmt: StmtT<"LJSExternFunction">,
): void {
  for (const param of stmt.func.params) {
    if (param.type_annotation) {
      visitor.visit_type_annotation(param.type_annotation)
    }
  }
  if (stmt.func.return_type) {
    visitor.visit_type_annotation(stmt.func.return_type)
  }
}
function walk_expr(visitor: ASTVisitor, expr: Expr): void {
  switch (expr.kind) {
    case "Call":
      visitor.visit_call_expr(expr)
      break
    case "Var":
      visitor.visit_var_expr(expr)
      break
    case "TaggedTemplateLiteral":
      visitor.visit_tagged_template_literal(expr)
      break
    default:
      todo(`Unhandled expression kind: ${expr.kind}`)
  }
}
function walk_type_annotation(
  visitor: ASTVisitor,
  type_annotation: TypeAnnotation,
): void {
  switch (type_annotation.kind) {
    case "LJSConstPtr":
      visitor.visit_ljs_const_ptr(type_annotation)
      break
    case "LJSPtr":
      visitor.visit_ljs_ptr(type_annotation)
      break
    case "Ident":
      visitor.visit_ident_type_annotation(type_annotation)
      break
    default:
      todo(`Unhandled type annotation kind: ${type_annotation.kind}`)
  }
}
function walk_func(visitor: ASTVisitor, func: Func): void {
  for (const param of func.params.params) {
    if (param.type_annotation) {
      visitor.visit_type_annotation(param.type_annotation)
    }
  }
  if (func.return_type) {
    visitor.visit_type_annotation(func.return_type)
  }
  visitor.visit_block(func.body)
}
function walk_block(visitor: ASTVisitor, block: Block): void {
  for (const stmt of block.stmts) {
    visitor.visit_stmt(stmt)
  }
}
function walk_source_file(visitor: ASTVisitor, source_file: SourceFile): void {
  for (const stmt of source_file.stmts) {
    visitor.visit_stmt(stmt)
  }
}
function walk_call_expr(visitor: ASTVisitor, expr: ExprT<"Call">): void {
  visitor.visit_expr(expr.callee)
  for (const arg of expr.args) {
    visitor.visit_expr(arg)
  }
}
function walk_tagged_template_literal(
  visitor: ASTVisitor,
  expr: ExprT<"TaggedTemplateLiteral">,
): void {
  visitor.visit_expr(expr.tag)
  for (const arg of expr.fragments) {
    if (arg.kind === "Expr") {
      visitor.visit_expr(arg.expr)
    }
  }
}
function todo(message = "Not implemented"): never {
  throw new Error(`TODO: ${message}`)
}
