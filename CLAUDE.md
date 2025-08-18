# Bash commands (from ./djs_ljs directory)
- ./main.ts my_program.ljs -o my_program : Compile my_program.ljs into an executable named my_program

- ./main.ts my_program.ljs --dump-ast: Print the ast
- ./main.ts my_program.ljs --dump-typecheck: Print typecheck results
- ./main.ts my_program.ljs --dump-resolve-imports: Print the name resolution
- pnpm tsc --noEmit: Typecheck the compiler


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
