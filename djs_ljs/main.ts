#!/usr/bin/env node --no-warnings=ExperimentalWarning
// Uses experimental type stripping for convenience

import { parseArgs } from "node:util"
import fs from "node:fs/promises"
import { parse_source_file } from "djs_parser"
import {
  BaseASTVisitor,
  Expr,
  type ASTVisitor,
  type SourceFile,
  type Stmt,
} from "djs_ast"
import { AssertionError } from "node:assert"
import { assert } from "node:console"

const USAGE = `
Usage: djs_ljs <FILE> -o <FILE>
`.trim()

await main()
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
      output: {
        type: "string",
        short: "o",
      },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }

  if (positionals.length === 0) {
    console.error("No input file specified.")
    console.error(USAGE)
    process.exit(1)
  }
  if (positionals.length > 1) {
    console.error("Too many input files specified.")
    console.error(USAGE)
    process.exit(1)
  }

  const input_path = positionals[0]
  if (!(await is_readable(input_path))) {
    console.error(`Input file "${input_path}" is not readable.`)
    process.exit(1)
  }
  const source_file = parse_source_file(
    input_path,
    await fs.readFile(input_path, "utf-8"),
  )
  resolve(source_file)
}

function resolve(source_file: SourceFile): void {
  interface SymbolTable {
    values: Map<string, Symbol>
  }
  type Symbol = {
    name: string
    delcaration: Stmt
  }
  class Resolver extends BaseASTVisitor {
    symbol_tables: SymbolTable[] = []
    get #scope(): SymbolTable {
      assert(this.symbol_tables.length > 0)
      return this.symbol_tables[this.symbol_tables.length - 1]
    }
    override visit_source_file(source_file: SourceFile): void {
      this.symbol_tables.push({ values: new Map() })
      super.visit_source_file(source_file)
      this.symbol_tables.pop()
      assert(this.symbol_tables.length === 0)
    }
    override visit_stmt(stmt: Stmt): void {
      switch (stmt.kind) {
        case "LJSExternFunction": {
          this.#scope.values.set(stmt.name, {
            name: stmt.name,
            delcaration: stmt,
          })
        }
        default:
          super.visit_stmt(stmt)
      }
    }
  }
  new Resolver().visit_source_file(source_file)
}
function todo(): never {
  throw new AssertionError({
    message: "Not implemented",
    stackStartFn: todo,
  })
}

async function is_readable(path: string): Promise<boolean> {
  try {
    await fs.access(path, fs.constants.R_OK)
    return true
  } catch (e) {
    if (
      e instanceof Error &&
      "code" in e &&
      (e.code === "ENOENT" || e.code === "EACCES" || e.code === "EPERM")
    ) {
      return false
    } else {
      throw e
    }
  }
}
