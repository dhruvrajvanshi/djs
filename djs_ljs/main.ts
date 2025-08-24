#!/usr/bin/env -S node
import Path from "node:path"
import { parseArgs, type ParseArgsConfig } from "node:util"
import {
  expr_to_sexpr,
  prettify_diagnostics,
  source_file_to_sexpr,
  type_annotation_to_sexpr,
} from "djs_ast"
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
import { exit } from "node:process"
import { assert } from "node:console"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { execSync } from "node:child_process"

const argsConfig = {
  allowPositionals: true,
  options: {
    "dump-phases": { type: "boolean" },
    "dump-ast": { type: "boolean" },
    "dump-resolve": { type: "boolean" },
    "dump-resolve-imports": { type: "boolean" },
    "dump-typecheck": { type: "boolean" },
    "tc-trace": { type: "string" },
    "no-errors": { type: "boolean" },
    "no-colors": { type: "boolean" },
    output: { type: "string", short: "o" },
  },
} satisfies ParseArgsConfig

interface MainIO {
  /**
   * Diagnostics are returned to this callback.
   */
  show_diagnostics: (diagnostics: string) => void
  /**
   * Called when the compilation has diagnostics
   */
  error_exit: () => void
}
const DEFAULT_MAIN_IO: MainIO = {
  show_diagnostics: (diagnostics: string) => {
    console.log(diagnostics)
  },
  error_exit: () => {
    process.exit(1)
  },
}

export async function main(
  { positionals: files, values: args } = parseArgs(argsConfig),
  io: MainIO = DEFAULT_MAIN_IO,
) {
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

  const typecheck_result = typecheck(source_files, resolve_result)
  if (dump_typecheck) dump_typecheck_result(typecheck_result)
  if (args["tc-trace"]) {
    await typecheck_result.trace.write(args["tc-trace"])
  }

  const diagnostics = Diagnostics.merge(
    collect_source_files_result.diagnostics,
    resolve_result.diagnostics,
    typecheck_result.diagnostics,
  )

  if (!args["no-errors"] && diagnostics.size > 0) {
    for (const [path, d] of diagnostics.entries()) {
      const diagnostics = await prettify_diagnostics(
        path,
        d,
        null,
        !args["no-colors"],
      )
      io.show_diagnostics(diagnostics)
    }
  }
  if (diagnostics.size > 0) {
    return io.error_exit()
  }
  const c_source = emit_c(source_files, typecheck_result, resolve_result)
  assert(args.output, `Output path is not provided`)
  const output_c_path = Path.join(".ljs", args.output + ".c")
  await mkdir(Path.dirname(output_c_path), { recursive: true })
  await writeFile(output_c_path, c_source)
  execSync(`gcc -o ${args.output} ${output_c_path}`, { stdio: "inherit" })
  await rm(output_c_path)
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
      MapUtils.map_entries(types, ([key, value]) => [key, value]),
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
  for (const [expr, type] of typecheck_result.values.entries()) {
    console.dir([expr_to_sexpr(expr), type_to_sexpr(type)], { depth: 2 })
  }
  for (const [annotation, type] of typecheck_result.types.entries()) {
    console.dir([type_annotation_to_sexpr(annotation), type_to_sexpr(type)], {
      depth: 2,
    })
  }
  console.log(`${ANSI_BLUE}${ANSI_BOLD}/typecheck${ANSI_RESET}`)
  console.log("")
}
declare global {
  interface ImportMeta {
    main: boolean
  }
}
if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    exit(1)
  }
}
