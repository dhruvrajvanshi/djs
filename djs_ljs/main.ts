#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import { show_diagnostics, source_file_to_sexpr } from "djs_ast"
import { collect_source_files } from "./collect_source_files.ts"
import { FS } from "./FS.ts"
import { Diagnostics } from "./diagnostics.ts"
import { emit_c } from "./emit_c.ts"
import { resolve, type ResolveResult } from "./resolve.ts"
import {
  ANSI_BLUE,
  ANSI_BOLD,
  ANSI_CYAN,
  ANSI_MAGENTA,
  ANSI_RESET,
  MapUtils,
} from "djs_std"

async function main() {
  const { positionals: files, values: args } = parseArgs({
    allowPositionals: true,
    options: {
      "dump-phases": { type: "boolean", default: false },
      "dump-ast": { type: "boolean", default: false },
      "dump-resolve": { type: "boolean", default: false },
      "no-errors": { type: "boolean", default: false },
    },
  })
  const dump_ast = args["dump-ast"] || args["dump-phases"]
  const dump_resolve = args["dump-resolve"] || args["dump-phases"]

  if (files.length === 0) {
    console.error("No files provided.")
    process.exit(1)
  }
  if (files.length > 1) {
    console.error("Only one entrypoint must be provided.")
    process.exit(1)
  }

  const fs = FS.real

  const collect_source_files_result = await collect_source_files(files[0], fs)

  if (dump_ast) {
    console.log(`${ANSI_BLUE}${ANSI_BOLD}---- ast ----${ANSI_RESET}`)
    for (const source_file of collect_source_files_result.source_files.values()) {
      console.dir(source_file_to_sexpr(source_file), {
        depth: null,
      })
    }
  }
  const resolve_result = resolve(fs, collect_source_files_result.source_files)

  if (dump_resolve) {
    dump_resolve_results(resolve_result)
  }

  const diagnostics = Diagnostics.merge(
    collect_source_files_result.diagnostics,
    resolve_result.diagnostics,
  )

  if (!args["no-errors"]) {
    for (const [path, d] of diagnostics.entries()) {
      await show_diagnostics(path, d, null)
    }
  }
  emit_c(collect_source_files_result.source_files)
}

function dump_resolve_results(resolve_result: ResolveResult) {
  console.log(`${ANSI_BLUE}${ANSI_BOLD}Resolve:${ANSI_RESET}`)
  for (const [path, types] of resolve_result.types.entries()) {
    console.log(`${ANSI_CYAN}${ANSI_BOLD}resolve: ${path}${ANSI_RESET}`)
    console.log(`${ANSI_MAGENTA}Types:${ANSI_RESET}`)
    console.dir(
      MapUtils.map_entries(types, ([key, value]) => [key.text, value]),
      { depth: 2 },
    )
    console.log(`${ANSI_CYAN}Values:${ANSI_RESET}`)
    console.dir(
      MapUtils.map_entries(
        resolve_result.values.get(path) ?? new Map(),
        ([key, value]) => [key.text, value],
      ),
      { depth: 2 },
    )
    console.log(`${ANSI_CYAN}${ANSI_BOLD}/resolve ${path}${ANSI_RESET}`)
  }
  console.log(`${ANSI_BLUE}${ANSI_BOLD}/resolve${ANSI_RESET}`)
}

await main()
