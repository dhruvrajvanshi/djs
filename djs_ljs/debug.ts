#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import fs from "node:fs/promises"
import { parse_source_file, show_diagnostics } from "djs_parser"
import { source_file_to_sexpr } from "../djs_ast/sexpr.ts"

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

const entry_path = files[0]

const entry_source_text = await fs.readFile(entry_path, "utf-8")
const entry_source_file = parse_source_file(entry_path, entry_source_text)
if (entry_source_file.errors.length > 0 && !args["no-errors"]) {
  console.log(
    show_diagnostics(entry_path, entry_source_text, entry_source_file.errors),
  )
}
if (args["dump-ast"]) {
  console.log("AST Dump:")
  console.dir(source_file_to_sexpr(entry_source_file), { depth: Infinity })
}
