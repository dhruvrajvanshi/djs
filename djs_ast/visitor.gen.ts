// This file is generated by gen_ts_visitor.ts, do not edit it manually
import * as ast from "./ast.gen.ts"

export interface ASTVisitor {
  visit_source_file(ast: ast.SourceFile): void
  visit_expr(expr: ast.Expr): void
  visit_stmt(stmt: ast.Stmt): void
  visit_pattern(pattern: ast.Pattern): void
  visit_block(block: ast.Block): void
}

export class ASTVisitorBase implements ASTVisitor {
  visit_source_file(node: ast.SourceFile): void {
    for (const stmt of node.stmts) {
      this.visit_stmt(stmt)
    }
    for (const error of node.errors) {
    }
  }
  visit_stmt(stmt: ast.Stmt): void {
    switch (stmt.kind) {
      case "Expr": {
        this.visit_expr(stmt.expr)
        break
      }
      case "Block": {
        this.visit_block(stmt.block)
        break
      }
      case "Return": {
        if (stmt.value !== null) {
          this.visit_expr(stmt.value)
        }
        break
      }
      case "VarDecl": {
        this.visit_var_decl(stmt.decl)
        break
      }
      case "If": {
        this.visit_expr(stmt.condition)
        this.visit_stmt(stmt.if_true)
        if (stmt.if_false !== null) {
          this.visit_stmt(stmt.if_false)
        }
        break
      }
      case "Switch": {
        this.visit_expr(stmt.condition)
        for (const c of stmt.cases) {
          this.visit_switch_case(c)
        }
        break
      }
      case "While": {
        this.visit_expr(stmt.condition)
        this.visit_stmt(stmt.body)
        break
      }
      case "DoWhile": {
        this.visit_stmt(stmt.body)
        this.visit_expr(stmt.condition)
        break
      }
      case "Try": {
        this.visit_block(stmt.try_block)
        if (stmt.catch_pattern !== null) {
          this.visit_pattern(stmt.catch_pattern)
        }
        if (stmt.catch_block !== null) {
          this.visit_block(stmt.catch_block)
        }
        if (stmt.finally_block !== null) {
          this.visit_block(stmt.finally_block)
        }
        break
      }
      case "For": {
        this.visit_for_init(stmt.init)
        if (stmt.test !== null) {
          this.visit_expr(stmt.test)
        }
        if (stmt.update !== null) {
          this.visit_expr(stmt.update)
        }
        this.visit_stmt(stmt.body)
        break
      }
      case "ForInOrOf": {
        if (stmt.decl_type !== null) {
        }
        this.visit_pattern(stmt.lhs)
        this.visit_expr(stmt.rhs)
        this.visit_stmt(stmt.body)
        break
      }
      case "Break": {
        if (stmt.label !== null) {
          this.visit_label(stmt.label)
        }
        break
      }
      case "Continue": {
        if (stmt.label !== null) {
          this.visit_label(stmt.label)
        }
        break
      }
      case "Debugger": {
        break
      }
      case "With": {
        this.visit_expr(stmt.expr)
        this.visit_stmt(stmt.body)
        break
      }
      case "Func": {
        this.visit_func(stmt.func)
        break
      }
      case "ClassDecl": {
        this.visit_class(stmt.class_def)
        break
      }
      case "Import": {
        if (stmt.default_import !== null) {
          this.visit_ident(stmt.default_import)
        }
        for (const named_import of stmt.named_imports) {
          this.visit_import_specifier(named_import)
        }
        break
      }
      case "ImportStarAs": {
        this.visit_ident(stmt.as_name)
        break
      }
      case "Labeled": {
        this.visit_label(stmt.label)
        this.visit_stmt(stmt.stmt)
        break
      }
      case "ObjectTypeDecl": {
        this.visit_ident(stmt.name)
        for (const field of stmt.fields) {
          this.visit_object_type_decl_field(field)
        }
        break
      }
      case "TypeAlias": {
        this.visit_ident(stmt.name)
        this.visit_type_annotation(stmt.type_annotation)
        break
      }
      case "LJSExternFunction": {
        this.visit_ident(stmt.name)
        for (const param of stmt.params) {
          this.visit_param(param)
        }
        this.visit_type_annotation(stmt.return_type)
        break
      }
      case "Empty": {
        break
      }
    }
  }
  visit_expr(expr: ast.Expr): void {
    switch (expr.kind) {
      case "Var": {
        this.visit_ident(expr.ident)
        break
      }
      case "Paren": {
        this.visit_expr(expr.expr)
        break
      }
      case "BinOp": {
        this.visit_expr(expr.lhs)
        this.visit_expr(expr.rhs)
        break
      }
      case "ArrowFn": {
        for (const param of expr.params) {
          this.visit_param(param)
        }
        if (expr.return_type !== null) {
          this.visit_type_annotation(expr.return_type)
        }
        this.visit_arrow_fn_body(expr.body)
        break
      }
      case "Func": {
        this.visit_func(expr.func)
        break
      }
      case "Call": {
        this.visit_expr(expr.callee)
        for (const arg of expr.args) {
          this.visit_expr(arg)
        }
        if (expr.spread !== null) {
          this.visit_expr(expr.spread)
        }
        break
      }
      case "Index": {
        this.visit_expr(expr.lhs)
        this.visit_expr(expr.property)
        break
      }
      case "Prop": {
        this.visit_expr(expr.lhs)
        this.visit_ident(expr.property)
        break
      }
      case "String": {
        break
      }
      case "Number": {
        break
      }
      case "Boolean": {
        break
      }
      case "Null": {
        break
      }
      case "Undefined": {
        break
      }
      case "Object": {
        for (const entrie of expr.entries) {
          this.visit_object_literal_entry(entrie)
        }
        break
      }
      case "Throw": {
        this.visit_expr(expr.value)
        break
      }
      case "PostIncrement": {
        this.visit_expr(expr.value)
        break
      }
      case "PostDecrement": {
        this.visit_expr(expr.value)
        break
      }
      case "PreIncrement": {
        this.visit_expr(expr.value)
        break
      }
      case "PreDecrement": {
        this.visit_expr(expr.value)
        break
      }
      case "Array": {
        for (const item of expr.items) {
          this.visit_array_literal_member(item)
        }
        break
      }
      case "New": {
        this.visit_expr(expr.expr)
        break
      }
      case "Yield": {
        if (expr.value !== null) {
          this.visit_expr(expr.value)
        }
        break
      }
      case "YieldFrom": {
        this.visit_expr(expr.expr)
        break
      }
      case "Ternary": {
        this.visit_expr(expr.condition)
        this.visit_expr(expr.if_true)
        this.visit_expr(expr.if_false)
        break
      }
      case "Assign": {
        this.visit_pattern(expr.pattern)
        this.visit_expr(expr.value)
        break
      }
      case "Regex": {
        break
      }
      case "Delete": {
        this.visit_expr(expr.expr)
        break
      }
      case "Void": {
        this.visit_expr(expr.expr)
        break
      }
      case "TypeOf": {
        this.visit_expr(expr.expr)
        break
      }
      case "UnaryPlus": {
        this.visit_expr(expr.expr)
        break
      }
      case "UnaryMinus": {
        this.visit_expr(expr.expr)
        break
      }
      case "BitNot": {
        this.visit_expr(expr.expr)
        break
      }
      case "Not": {
        this.visit_expr(expr.expr)
        break
      }
      case "Await": {
        this.visit_expr(expr.expr)
        break
      }
      case "Comma": {
        for (const item of expr.items) {
          this.visit_expr(item)
        }
        break
      }
      case "Super": {
        break
      }
      case "Class": {
        this.visit_class(expr.class_def)
        break
      }
      case "TemplateLiteral": {
        for (const fragment of expr.fragments) {
          this.visit_template_literal_fragment(fragment)
        }
        break
      }
      case "TaggedTemplateLiteral": {
        this.visit_expr(expr.tag)
        for (const fragment of expr.fragments) {
          this.visit_template_literal_fragment(fragment)
        }
        break
      }
      case "Builtin": {
        break
      }
    }
  }
  visit_ident(node: ast.Ident): void {}
  visit_param(node: ast.Param): void {
    this.visit_pattern(node.pattern)
    if (node.type_annotation !== null) {
      this.visit_type_annotation(node.type_annotation)
    }
    if (node.initializer !== null) {
      this.visit_expr(node.initializer)
    }
  }
  visit_pattern(pattern: ast.Pattern): void {
    switch (pattern.kind) {
      case "Var": {
        this.visit_ident(pattern.ident)
        break
      }
      case "Assignment": {
        this.visit_pattern(pattern.pattern)
        this.visit_expr(pattern.initializer)
        break
      }
      case "Array": {
        for (const item of pattern.items) {
          this.visit_pattern(item)
        }
        break
      }
      case "Object": {
        for (const propertie of pattern.properties) {
          this.visit_object_pattern_property(propertie)
        }
        if (pattern.rest !== null) {
          this.visit_pattern(pattern.rest)
        }
        break
      }
      case "Prop": {
        this.visit_expr(pattern.expr)
        this.visit_object_key(pattern.key)
        break
      }
      case "Elision": {
        break
      }
      case "Rest": {
        this.visit_pattern(pattern.pattern)
        break
      }
    }
  }
  visit_object_pattern_property(node: ast.ObjectPatternProperty): void {
    this.visit_object_key(node.key)
    this.visit_pattern(node.value)
  }
  visit_object_key(object_key: ast.ObjectKey): void {
    switch (object_key.kind) {
      case "Ident": {
        this.visit_ident(object_key.ident)
        break
      }
      case "String": {
        break
      }
      case "Computed": {
        this.visit_expr(object_key.expr)
        break
      }
    }
  }
  visit_type_annotation(type_annotation: ast.TypeAnnotation): void {
    switch (type_annotation.kind) {
      case "Ident": {
        this.visit_ident(type_annotation.ident)
        break
      }
      case "Union": {
        this.visit_type_annotation(type_annotation.left)
        this.visit_type_annotation(type_annotation.right)
        break
      }
      case "Array": {
        this.visit_type_annotation(type_annotation.item)
        break
      }
      case "ReadonlyArray": {
        this.visit_type_annotation(type_annotation.item)
        break
      }
      case "Application": {
        this.visit_type_annotation(type_annotation.callee)
        for (const arg of type_annotation.args) {
          this.visit_type_annotation(arg)
        }
        break
      }
      case "String": {
        break
      }
      case "Func": {
        for (const type_param of type_annotation.type_params) {
          this.visit_type_param(type_param)
        }
        for (const param of type_annotation.params) {
          this.visit_func_type_param(param)
        }
        this.visit_type_annotation(type_annotation.returns)
        break
      }
      case "LJSMutPtr": {
        this.visit_type_annotation(type_annotation.to)
        break
      }
      case "LJSPtr": {
        this.visit_type_annotation(type_annotation.to)
        break
      }
      case "Builtin": {
        break
      }
      case "Qualified": {
        this.visit_ident(type_annotation.head)
        for (const tail of type_annotation.tail) {
          this.visit_ident(tail)
        }
        break
      }
    }
  }
  visit_type_param(node: ast.TypeParam): void {
    this.visit_ident(node.ident)
  }
  visit_func_type_param(node: ast.FuncTypeParam): void {
    this.visit_ident(node.label)
    this.visit_type_annotation(node.type_annotation)
  }
  visit_arrow_fn_body(arrow_fn_body: ast.ArrowFnBody): void {
    switch (arrow_fn_body.kind) {
      case "Expr": {
        this.visit_expr(arrow_fn_body.expr)
        break
      }
      case "Block": {
        this.visit_block(arrow_fn_body.block)
        break
      }
    }
  }
  visit_block(node: ast.Block): void {
    for (const stmt of node.stmts) {
      this.visit_stmt(stmt)
    }
  }
  visit_func(node: ast.Func): void {
    if (node.name !== null) {
      this.visit_ident(node.name)
    }
    for (const type_param of node.type_params) {
      this.visit_type_param(type_param)
    }
    for (const param of node.params) {
      this.visit_param(param)
    }
    this.visit_block(node.body)
    if (node.return_type !== null) {
      this.visit_type_annotation(node.return_type)
    }
  }
  visit_object_literal_entry(
    object_literal_entry: ast.ObjectLiteralEntry,
  ): void {
    switch (object_literal_entry.kind) {
      case "Ident": {
        this.visit_ident(object_literal_entry.ident)
        break
      }
      case "Prop": {
        this.visit_object_key(object_literal_entry.key)
        this.visit_expr(object_literal_entry.value)
        break
      }
      case "Method": {
        this.visit_method_def(object_literal_entry.method)
        break
      }
      case "Spread": {
        this.visit_expr(object_literal_entry.expr)
        break
      }
    }
  }
  visit_method_def(node: ast.MethodDef): void {
    this.visit_object_key(node.name)
    this.visit_func(node.body)
    if (node.return_type !== null) {
      this.visit_type_annotation(node.return_type)
    }
    if (node.accessor_type !== null) {
    }
  }
  visit_array_literal_member(
    array_literal_member: ast.ArrayLiteralMember,
  ): void {
    switch (array_literal_member.kind) {
      case "Expr": {
        this.visit_expr(array_literal_member.expr)
        break
      }
      case "Elision": {
        break
      }
      case "Spread": {
        this.visit_expr(array_literal_member.expr)
        break
      }
    }
  }
  visit_class(node: ast.Class): void {
    if (node.name !== null) {
      this.visit_ident(node.name)
    }
    if (node.superclass !== null) {
      this.visit_expr(node.superclass)
    }
    this.visit_class_body(node.body)
  }
  visit_class_body(node: ast.ClassBody): void {
    for (const member of node.members) {
      this.visit_class_member(member)
    }
  }
  visit_class_member(class_member: ast.ClassMember): void {
    switch (class_member.kind) {
      case "MethodDef": {
        this.visit_method_def(class_member.method)
        break
      }
      case "FieldDef": {
        this.visit_field_def(class_member.field)
        break
      }
    }
  }
  visit_field_def(node: ast.FieldDef): void {
    this.visit_ident(node.name)
    if (node.initializer !== null) {
      this.visit_expr(node.initializer)
    }
  }
  visit_template_literal_fragment(
    template_literal_fragment: ast.TemplateLiteralFragment,
  ): void {
    switch (template_literal_fragment.kind) {
      case "Text": {
        break
      }
      case "Expr": {
        this.visit_expr(template_literal_fragment.expr)
        break
      }
    }
  }
  visit_var_decl(node: ast.VarDecl): void {
    for (const declarator of node.declarators) {
      this.visit_var_declarator(declarator)
    }
  }
  visit_var_declarator(node: ast.VarDeclarator): void {
    this.visit_pattern(node.pattern)
    if (node.type_annotation !== null) {
      this.visit_type_annotation(node.type_annotation)
    }
    if (node.init !== null) {
      this.visit_expr(node.init)
    }
  }
  visit_switch_case(node: ast.SwitchCase): void {
    if (node.test !== null) {
      this.visit_expr(node.test)
    }
    for (const body of node.body) {
      this.visit_stmt(body)
    }
  }
  visit_for_init(for_init: ast.ForInit): void {
    switch (for_init.kind) {
      case "VarDecl": {
        this.visit_var_decl(for_init.decl)
        break
      }
      case "Expr": {
        this.visit_expr(for_init.expr)
        break
      }
    }
  }
  visit_label(node: ast.Label): void {}
  visit_import_specifier(node: ast.ImportSpecifier): void {
    if (node.as_name !== null) {
      this.visit_ident(node.as_name)
    }
    this.visit_module_export_name(node.imported_name)
  }
  visit_module_export_name(module_export_name: ast.ModuleExportName): void {
    switch (module_export_name.kind) {
      case "Ident": {
        this.visit_ident(module_export_name.ident)
        break
      }
      case "String": {
        break
      }
    }
  }
  visit_object_type_decl_field(node: ast.ObjectTypeDeclField): void {
    this.visit_ident(node.label)
    this.visit_type_annotation(node.type_annotation)
  }
}
