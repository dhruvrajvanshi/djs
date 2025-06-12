#!/usr/bin/env -S node --no-warnings

import { parseArgs } from "node:util"
import { show_diagnostics, source_file_to_sexpr } from "djs_ast"
import { Diagnostics } from "./diagnostics.ts"
import { collect_source_files } from "./collect_source_files.ts"

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

await main()
