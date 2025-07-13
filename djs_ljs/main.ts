#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import { show_diagnostics, source_file_to_sexpr, stmt_to_sexpr } from "djs_ast"
import { collect_source_files } from "./collect_source_files.ts"
import { FS } from "./FS.ts"
import { Diagnostics } from "./diagnostics.ts"
import { emit_c } from "./emit_c.ts"
import { resolve } from "./resolve.ts"

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
  const resolution_results =
    collect_source_files_result.source_files.map_values((source_file) =>
      resolve(fs, source_file),
    )

  const diagnostics = Diagnostics.merge(
    collect_source_files_result.diagnostics,
    ...[...resolution_results.values()].map((result) => result.diagnostics),
  )

  if (!args["no-errors"]) {
    for (const [path, d] of diagnostics.entries()) {
      await show_diagnostics(path, d, null)
    }
  }
  emit_c(collect_source_files_result.source_files)
}

await main()
