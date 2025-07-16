#!/usr/bin/env -S node

import { parseArgs } from "node:util"
import { expr_to_sexpr, show_diagnostics, source_file_to_sexpr } from "djs_ast"
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
import type { SourceFiles } from "./SourceFiles.ts"
import {
  resolve_imports,
  type ResolveImportsResult,
} from "./resolve_imports.ts"
import { typecheck, type TypecheckResult } from "./typecheck.ts"
import { type_to_sexpr } from "./type.ts"
import { build_tc_graph } from "./tc_graph.ts"
import { exit } from "node:process"

async function main() {
  const { positionals: files, values: args } = parseArgs({
    allowPositionals: true,
    options: {
      "dump-phases": { type: "boolean", default: false },
      "dump-ast": { type: "boolean", default: false },
      "dump-resolve": { type: "boolean", default: false },
      "dump-resolve-imports": { type: "boolean", default: false },
      "dump-typecheck": { type: "boolean", default: false },
      "tc-graph": { type: "string", default: "" },
      "no-errors": { type: "boolean", default: false },
    },
  })
  const dump_ast = args["dump-ast"] || args["dump-phases"]
  const dump_resolve = args["dump-resolve"] || args["dump-phases"]
  const dump_resolve_imports =
    args["dump-resolve-imports"] || args["dump-phases"]
  const dump_typecheck = args["dump-typecheck"] || args["dump-phases"]

  if (files.length === 0) {
    console.error("No files provided.")
    process.exit(1)
  }
  if (files.length > 1) {
    console.error("Only one entrypoint must be provided.")
    process.exit(1)
  }

  const fs = FS.real

  const { source_files, ...collect_source_files_result } =
    await collect_source_files(files[0], fs)
  if (dump_ast) dump_source_files(source_files)

  const resolve_result = resolve(fs, source_files)
  if (dump_resolve) dump_resolve_results(resolve_result)

  const resolve_imports_result = resolve_imports(source_files, resolve_result)
  if (dump_resolve_imports) {
    return dump_resolve_imports_results(resolve_imports_result)
  }

  build_tc_graph(source_files)

  const typecheck_result = typecheck(
    source_files,
    resolve_imports_result.values,
    resolve_imports_result.types,
  )
  if (dump_typecheck) dump_typecheck_result(typecheck_result)

  const tc_graph = build_tc_graph(source_files)
  if (args["tc-graph"]) {
    await tc_graph.render_to_file(args["tc-graph"])
    console.log(`Typecheck graph written to ${args["tc-graph"]}`)
  }

  const diagnostics = Diagnostics.merge(
    collect_source_files_result.diagnostics,
    resolve_result.diagnostics,
    typecheck_result.diagnostics,
  )

  if (!args["no-errors"]) {
    for (const [path, d] of diagnostics.entries()) {
      await show_diagnostics(path, d, null)
    }
  }
  emit_c(source_files)
}
function dump_source_files(source_files: SourceFiles) {
  console.log(`${ANSI_BLUE}${ANSI_BOLD}---- ast ----${ANSI_RESET}`)
  for (const source_file of source_files.values()) {
    console.dir(source_file_to_sexpr(source_file), {
      depth: null,
    })
  }
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
    console.log("")
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
  console.log("")
}
function dump_resolve_imports_results(resolve_result: ResolveImportsResult) {
  console.log(`${ANSI_BLUE}${ANSI_BOLD}Resolve imports:${ANSI_RESET}`)
  for (const [path, types] of resolve_result.types.entries()) {
    console.log(
      `${ANSI_CYAN}${ANSI_BOLD}resolved imports: ${path}${ANSI_RESET}`,
    )
    console.log(`${ANSI_MAGENTA}Types:${ANSI_RESET}`)
    console.dir(
      MapUtils.map_entries(types, ([key, value]) => [key.text, value]),
      { depth: 3 },
    )
    console.log("")
    console.log(`${ANSI_CYAN}Values:${ANSI_RESET}`)
    console.dir(
      MapUtils.map_entries(
        resolve_result.values.get(path) ?? new Map(),
        ([key, value]) => [key.text, value],
      ),
      { depth: 3 },
    )
    console.log(
      `${ANSI_CYAN}${ANSI_BOLD}/resolved imports ${path}${ANSI_RESET}`,
    )
  }
  console.log(`${ANSI_BLUE}${ANSI_BOLD}/resolve imports${ANSI_RESET}`)
  console.log("")
}

function dump_typecheck_result(typecheck_result: TypecheckResult) {
  console.log(`${ANSI_BLUE}${ANSI_BOLD}Typecheck:${ANSI_RESET}`)
  for (const [expr, type] of typecheck_result.types.entries()) {
    console.dir([expr_to_sexpr(expr), type_to_sexpr(type)], { depth: 2 })
  }
  console.log(`${ANSI_BLUE}${ANSI_BOLD}/typecheck${ANSI_RESET}`)
  console.log("")
}

try {
  await main()
} catch (error) {
  console.error(error)
  exit(1)
}
