export { find_expr, find_type, find_stmt }

import { AssertionError } from "assert"
import {
  ASTVisitorBase,
  Stmt,
  TypeAnnotation,
  type Expr,
  type SourceFile,
} from "djs_ast"
import { type AnyFunc, type Predicate } from "djs_std"

function find_expr<Kind extends Expr["kind"]>(
  source_file: SourceFile,
  kind: Kind,
  predicate: Predicate<Extract<Expr, { kind: Kind }>>,
  stackStartFn: AnyFunc = find_expr,
): Extract<Expr, { kind: Kind }> {
  const visitor = new FindExprVisitor(kind, predicate, stackStartFn)
  visitor.visit_source_file(source_file)
  if (!visitor.result) {
    throw new AssertionError({
      message: `Expr(kind = ${kind}, ${predicate.toString()}) not found`,
      stackStartFn: find_expr,
    })
  }
  return visitor.result
}

class FindExprVisitor<Kind extends Expr["kind"]> extends ASTVisitorBase {
  result: Extract<Expr, { kind: Kind }> | undefined
  constructor(
    private readonly kind: Kind,
    private readonly predicate: Predicate<Extract<Expr, { kind: Kind }>>,
    private readonly stackStartFn: (...args: never[]) => unknown = find_expr,
  ) {
    super()
  }

  override visit_expr(expr: Expr): void {
    if (
      expr.kind === this.kind &&
      this.predicate(expr as Extract<Expr, { kind: Kind }>)
    ) {
      if (this.result) {
        throw new AssertionError({
          message: `Multiple Expr with kind "${this.kind}" found`,
          stackStartFn: this.stackStartFn,
        })
      }
      this.result = expr as Extract<Expr, { kind: Kind }>
    } else {
      super.visit_expr(expr)
    }
  }
}

function find_type<Kind extends TypeAnnotation["kind"]>(
  source_file: SourceFile,
  kind: Kind,
  predicate: Predicate<Extract<TypeAnnotation, { kind: Kind }>>,
  stackStartFn: AnyFunc = find_type,
): Extract<TypeAnnotation, { kind: Kind }> {
  const visitor = new FindTypeVisitor(kind, predicate, stackStartFn)
  visitor.visit_source_file(source_file)
  if (!visitor.result) {
    throw new AssertionError({
      message: `TypeAnnotation(kind = ${kind}, ${predicate.toString()}) not found`,
      stackStartFn: find_type,
    })
  }
  return visitor.result
}

class FindTypeVisitor<
  Kind extends TypeAnnotation["kind"],
> extends ASTVisitorBase {
  result: Extract<TypeAnnotation, { kind: Kind }> | undefined
  constructor(
    private readonly kind: Kind,
    private readonly predicate: Predicate<
      Extract<TypeAnnotation, { kind: Kind }>
    >,
    private readonly stackStartFn: AnyFunc = find_type,
  ) {
    super()
  }

  override visit_type_annotation(type_annotation: TypeAnnotation): void {
    if (
      type_annotation.kind === this.kind &&
      this.predicate(type_annotation as Extract<TypeAnnotation, { kind: Kind }>)
    ) {
      if (this.result) {
        throw new AssertionError({
          message: `Multiple TypeAnnotation with kind "${this.kind}" found`,
          stackStartFn: this.stackStartFn,
        })
      }
      this.result = type_annotation as Extract<TypeAnnotation, { kind: Kind }>
    } else {
      super.visit_type_annotation(type_annotation)
    }
  }
}

function find_stmt<Kind extends Stmt["kind"]>(
  source_file: SourceFile,
  kind: Kind,
  predicate: Predicate<Stmt>,
  stackStartFn: AnyFunc = find_stmt,
): Extract<Stmt, { kind: string }> {
  const visitor = new FindStmtVisitor(kind, predicate, stackStartFn)
  visitor.visit_source_file(source_file)
  if (!visitor.result) {
    throw new AssertionError({
      message: `Stmt(${predicate.toString()}) not found`,
      stackStartFn: find_stmt,
    })
  }
  return visitor.result
}
class FindStmtVisitor<Kind extends Stmt["kind"]> extends ASTVisitorBase {
  result: Extract<Stmt, { kind: Kind }> | undefined
  constructor(
    private readonly kind: Kind,
    private readonly predicate: Predicate<Stmt>,
    private readonly stackStartFn: AnyFunc = find_stmt,
  ) {
    super()
  }

  override visit_stmt(stmt: Stmt): void {
    if (this.kind == stmt.kind && this.predicate(stmt)) {
      if (this.result) {
        throw new AssertionError({
          message: `Multiple Stmt(kind = ${this.kind}, match = ${this.predicate})" found`,
          stackStartFn: this.stackStartFn,
        })
      }
      this.result = stmt as never
    } else {
      super.visit_stmt(stmt)
    }
  }
}
