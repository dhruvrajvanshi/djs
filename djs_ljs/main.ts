#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import { show_diagnostics, source_file_to_sexpr, stmt_to_sexpr } from "djs_ast"
import { collect_source_files } from "./collect_source_files.ts"
import { resolve_top_level } from "./resolve_top_level.ts"
import { FS } from "./FS.ts"
import { Diagnostics } from "./diagnostics.ts"
import { MapUtils } from "djs_std"
import { emit_c } from "./emit_c.ts"

async function main() {
  const { positionals: files, values: args } = parseArgs({
    allowPositionals: true,
    options: {
      "dump-phases": { type: "boolean", default: false },
      "dump-ast": { type: "boolean", default: false },
      "dump-resolve-top-level": { type: "boolean", default: false },
      "no-errors": { type: "boolean", default: false },
    },
  })
  const dump_ast = args["dump-ast"] || args["dump-phases"]
  const dump_resolve_top_level =
    args["dump-resolve-top-level"] || args["dump-phases"]

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
    console.log("---- ast ----")
    for (const source_file of collect_source_files_result.source_files.values()) {
      console.dir(source_file_to_sexpr(source_file), {
        depth: null,
      })
    }
  }

  const resolve_top_level_result = resolve_top_level(
    collect_source_files_result.source_files,
    fs,
  )
  if (dump_resolve_top_level) {
    console.log("---- resolve_top_level ----")
    console.dir(
      MapUtils.map_values(
        resolve_top_level_result.source_file_value_decls.toMap(),
        (bindings) => MapUtils.map_values(bindings, stmt_to_sexpr),
      ),
      {
        depth: 4,
      },
    )
  }

  const diagnostics = Diagnostics.merge(
    collect_source_files_result.diagnostics,
    resolve_top_level_result.diagnostics,
  )

  if (!args["no-errors"]) {
    for (const [path, d] of diagnostics.entries()) {
      await show_diagnostics(path, d, null)
    }
  }
  emit_c(collect_source_files_result.source_files)
}

await main()
