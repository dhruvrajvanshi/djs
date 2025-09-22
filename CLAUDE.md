# Overview
This repository contains a compiler for a low level JS like language called ljs.
Eventually, ljs will be used as a language to write a JS engine for a JS superset called djs.
The superset aims to support all JS syntax with static types which are preserved at runtime
for reflection and also used for optimizations, unlike Typescript which erases types at runtime.

# Commands
- pnpm typecheck: Typecheck the codebase
- pnpm build-ast: Build the AST package
- pnpm build-parser: Build the parser
- ./djs_ljs/main.ts program.ljs -o program: Compile program.ljs into an executable named program
- ./djs_parser/run_parser.ts --dump-ast program.ljs: Parse program.ljs and print the AST

# Code style
- Use `snake_case`.
- Avoid using classes. Favour keeping state in objects and having free standing functions.

# Packages

## djs_ast
- The generated AST nodes are in `djs_ast/ast.gen.ts`
- Important AST nodes are
  - `SourceFile` corresponds to a single source file
  - `Expr`: Expressions that yield a value
  - `Stmt`: Statements
  - `Func`: Function like ASTs (methods, functions, arrow functions).
            Usually wrapped inside the corresponding `Stmt` or `Expr`.
  - `Pattern`: Things that can appear as parameters and on the lhs of
    assignments.
  - `Ident`: Names. Usually found inside other ast nodes
- String and template literal nodes contain the raw text specified in the source file including the quotes and backslashes.


## djs_ljs
- This is a low level JS like language which compiles to C code.
### Phases of ljs compiler
- collect_source_files: Takes the path to an entry file and creates a
  `PathMap` of `SourceFile` objects (AST). Calls the `djs_parser` package.
- resolve: For each `Ident` in each `SoruceFile`, returns a
`ValueDecl` (for expressions) or `TypeDecl` (for type annotations).
- resolve_imports: Converts the `Import` and `ImportStarAs` declarations
into the underlying declaration by following the imports.
- typecheck: Assigns a `Type` to each `Expr` and `TypeAnnotation`.
Assigns a `CheckedVarDecl` to each `VarDeclStmt`, which is a flattened
list of `var/let/const name: Type = initializer; lhs.prop = rhs;` decls.
