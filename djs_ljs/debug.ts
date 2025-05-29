#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import fs from "node:fs/promises"
import { parse_source_file } from "djs_parser"
import type { SourceFile } from "djs_ast"
import assert from "node:assert"

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

const source_files = await collect_source_files(files[0])
console.log(source_files)

async function collect_source_files(entry_path: string) {
  const queue: Queue<string> = [entry_path]
  const source_files: Record<string, SourceFile> = {}
  while (queue.length > 0) {
    const path = queueTake(queue)
    if (path === null) {
      continue
    }
    const source_text = await fs.readFile(path, "utf-8")
    const source_file = parse_source_file(path, source_text)

    source_files[path] = source_file
    const imports = collect_imports(source_file)
    for (const import_path of imports) {
      if (!(import_path in source_files)) {
        queuePush(queue, import_path)
      }
    }
  }
  return source_files
}
function collect_imports(source_file: SourceFile): string[] {
  const imports: string[] = []
  for (const stmt of source_file.stmts) {
    // TODO(visitor): Handle nested imports when the visitor API is implemented
    if (stmt.kind === "Import") {
      imports.push(parse_module_specifier(stmt.module_specifier))
    }
  }
  return imports
}
function parse_module_specifier(specifier: string): string {
  const value: unknown = JSON.parse(specifier)
  assert(typeof value === "string", `Invalid module specifier: ${specifier}`)
  return value
}

type Queue<T> = T[]
function queueTake<T>(queue: Queue<T>): T | null {
  return queue.shift() ?? null
}
function queuePush<T>(queue: Queue<T>, item: T): void {
  queue.push(item)
}
