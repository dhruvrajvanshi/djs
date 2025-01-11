// This file is generated automatically
// python3 djs_ast/gen_visitor.py > djs_ast/src/visitor.rs && cargo fmt -- djs_ast/src/visitor.rs
// DO NOT EDIT

// Since this file is auto generated, we turn off the unused_variables lint to avoid
// having to add special cases for generated pattern names which are unused.
#![allow(unused_variables)]
use crate::ast::*;

pub trait Visitor<'a>: Sized {
    fn visit_source_file(&mut self, node: &SourceFile) {
        walk_source_file(self, node)
    }

    fn visit_stmt(&mut self, node: &Stmt) {
        walk_stmt(self, node)
    }

    fn visit_expr(&mut self, node: &Expr) {
        walk_expr(self, node)
    }

    fn visit_pattern(&mut self, node: &Pattern) {
        walk_pattern(self, node)
    }

    fn visit_param_list(&mut self, node: &ParamList) {
        walk_param_list(self, node)
    }

    fn visit_arrow_fn_body(&mut self, node: &ArrowFnBody) {
        walk_arrow_fn_body(self, node)
    }

    fn visit_block(&mut self, node: &Block) {
        walk_block(self, node)
    }

    fn visit_param(&mut self, node: &Param) {
        walk_param(self, node)
    }
}

pub fn walk_source_file<'a, V: Visitor<'a>>(visitor: &mut V, node: &SourceFile) {
    for item in &node.stmts {
        visitor.visit_stmt(item);
    }
}

pub fn walk_stmt<'a, V: Visitor<'a>>(visitor: &mut V, node: &Stmt) {
    match node {
        Stmt::Expr(_, f0) => {
            visitor.visit_expr(f0);
        }
        Stmt::Block(_, f0) => {
            visitor.visit_block(f0);
        }
        Stmt::Return(_, f0) => {
            if let Some(item) = f0 {
                visitor.visit_expr(item);
            }
        }
        Stmt::VarDecl(_, f0, f1, f2) => {
            visitor.visit_pattern(f1);
            if let Some(item) = f2 {
                visitor.visit_expr(item);
            }
        }
        Stmt::If(_, f0, f1, f2) => {
            visitor.visit_expr(f0);
            visitor.visit_stmt(f1);
            if let Some(item) = f2 {
                visitor.visit_stmt(item);
            }
        }
    }
}

pub fn walk_expr<'a, V: Visitor<'a>>(visitor: &mut V, node: &Expr) {
    match node {
        Expr::Var(_, f0) => {}
        Expr::BinOp(_, f0, f1, f2) => {
            visitor.visit_expr(f0);
            visitor.visit_expr(f2);
        }
        Expr::ArrowFn(_, f0, f1) => {
            visitor.visit_param_list(f0);
            visitor.visit_arrow_fn_body(f1);
        }
        Expr::Call(_, f0, f1) => {
            visitor.visit_expr(f0);
            for item in f1 {
                visitor.visit_expr(item);
            }
        }
        Expr::Member(_, f0, f1) => {
            visitor.visit_expr(f0);
            visitor.visit_expr(f1);
        }
    }
}

pub fn walk_pattern<'a, V: Visitor<'a>>(visitor: &mut V, node: &Pattern) {
    match node {
        Pattern::Var(_, f0) => {}
    }
}

pub fn walk_param_list<'a, V: Visitor<'a>>(visitor: &mut V, node: &ParamList) {
    for item in &node.params {
        visitor.visit_param(item);
    }
}

pub fn walk_arrow_fn_body<'a, V: Visitor<'a>>(visitor: &mut V, node: &ArrowFnBody) {
    match node {
        ArrowFnBody::Expr(_, f0) => {
            visitor.visit_expr(f0);
        }
        ArrowFnBody::Block(_, f0) => {
            visitor.visit_block(f0);
        }
    }
}

pub fn walk_block<'a, V: Visitor<'a>>(visitor: &mut V, node: &Block) {
    for item in &node.stmts {
        visitor.visit_stmt(item);
    }
}

pub fn walk_param<'a, V: Visitor<'a>>(visitor: &mut V, node: &Param) {}
