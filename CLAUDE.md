# Overview
This is a compiler for an AOT compiled Javascript superset called DJS.

Unlike typescript, the type annotations in DJS have runtime semantics. For example,
`x as SomeType` is compiled to (psuedo) `if (!(x hasType SomeType)) throw new TypeError(...)`.
The type assertions are elided when the type is known statically. The top type is `unknown`,
which can hold any possible value at runtime. Values are boxed automatically to `unknown`
when required.

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
- @djs_ast: Describes ast node in @djs_ast/ast.def.ts, which get codegened into @djs_ast/ast.gen.ts
- @djs_parser: Recursive descent parser
- @djs: Compiles djs source code to C. Has phases for name resolution, type checking and emitting C source.
- @djs_runtime: Should contain the types and functions that the generated C code can refer to.
