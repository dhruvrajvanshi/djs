#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import fs from "node:fs/promises"
import { parse_source_file } from "djs_parser"
import {
  ASTVisitorBase,
  show_diagnostics,
  source_file_to_sexpr,
  Stmt,
  type Diagnostic,
  type SourceFile,
} from "djs_ast"
import assert from "node:assert"
import { existsSync } from "node:fs"

async function main() {
  const { positionals: files, values: args } = parseArgs({
    allowPositionals: true,
    options: {
      "dump-ast": { type: "boolean", default: false },
      "no-errors": { type: "boolean", default: false },
    },
  })

  if (files.length === 0) {
    console.error("No files provided.")
    process.exit(1)
  }
  if (files.length > 1) {
    console.error("Only one entrypoint must be provided.")
    process.exit(1)
  }

  const diagnostics = new Diagnostics()
  const source_files = await collect_source_files(files[0], diagnostics)

  if (!args["no-errors"]) {
    for (const [path, d] of diagnostics) {
      await show_diagnostics(path, d, null)
    }
  }
  if (args["dump-ast"]) {
    for (const source_file of Object.values(source_files)) {
      console.dir(source_file_to_sexpr(source_file), {
        depth: null,
      })
    }
  }
}

class Diagnostics implements Iterable<[string, Diagnostic[]]> {
  #by_path: Record<string, Diagnostic[]> = {}

  push(path: string, ...diagnostics: Diagnostic[]) {
    if (!(path in this.#by_path)) {
      this.#by_path[path] = []
    }
    this.#by_path[path].push(...diagnostics)
  }

  [Symbol.iterator]() {
    return Object.entries(this.#by_path)[Symbol.iterator]()
  }
}

async function collect_source_files(
  entry_path: string,
  diagnostics: Diagnostics,
) {
  const queue: Queue<string> = [entry_path]
  const source_files: Record<string, SourceFile> = {}
  while (queue.length > 0) {
    const path = queue_take(queue)
    if (path === null) {
      continue
    }
    const source_text = await fs.readFile(path, "utf-8")
    const source_file = parse_source_file(path, source_text)

    source_files[path] = source_file
    diagnostics.push(path, ...source_file.errors)
    const imports = collect_imports(source_file, diagnostics)
    for (const import_path of imports) {
      if (!(import_path in source_files)) {
        queue_push(queue, import_path)
      }
    }
  }
  return source_files
}

class CollectImportsVisitor extends ASTVisitorBase {
  #diagnostics: Diagnostics
  #source_file: SourceFile
  readonly imports: string[] = []
  constructor(diagnostics: Diagnostics, source_file: SourceFile) {
    super()
    this.#diagnostics = diagnostics
    this.#source_file = source_file
  }

  override visit_stmt(stmt: Stmt): void {
    if (stmt.kind === "Import") {
      const path = parse_module_specifier(stmt.module_specifier)
      if (!existsSync(path)) {
        this.#diagnostics.push(this.#source_file.path, {
          span: {
            start: stmt.span.stop - stmt.module_specifier.length,
            stop: stmt.span.stop,
          },
          message: `Module not found`,
          hint: "The module path must be a path to a file relative to the current file. For example, if the current file is `src/main.ts`, and you want to import `src/utils.ts`, you should use `./utils.ts` as the module specifier.",
        })
      }
    } else {
      super.visit_stmt(stmt)
    }
  }
}
function collect_imports(
  source_file: SourceFile,
  diagnostics: Diagnostics,
): string[] {
  // for (const stmt of source_file.stmts) {
  //   // TODO(visitor): Handle nested imports when the visitor API is implemented
  //   if (stmt.kind === "Import") {
  //     const path = parse_module_specifier(stmt.module_specifier)
  //     if (!existsSync(path)) {
  //       diagnostics.push(source_file.path, {
  //         span: {
  //           start: stmt.span.stop - stmt.module_specifier.length,
  //           stop: stmt.span.stop,
  //         },
  //         message: `Module not found`,
  //         hint: "The module path must be a path to a file relative to the current file. For example, if the current file is `src/main.ts`, and you want to import `src/utils.ts`, you should use `./utils.ts` as the module specifier.",
  //       })
  //       continue
  //     }
  //     imports.push(path)
  //   }
  // }
  const visitor = new CollectImportsVisitor(diagnostics, source_file)
  visitor.visit_source_file(source_file)
  return visitor.imports
}
function parse_module_specifier(specifier: string): string {
  const value: unknown = JSON.parse(specifier)
  assert(typeof value === "string", `Invalid module specifier: ${specifier}`)
  return value
}

type Queue<T> = T[]
function queue_take<T>(queue: Queue<T>): T | null {
  return queue.shift() ?? null
}
function queue_push<T>(queue: Queue<T>, item: T): void {
  queue.push(item)
}

await main()
