#!/usr/bin/env node
import { resolve } from "node:path"
import { realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { create_runtime, run_module } from "./runtime/modules.js"
import { bootstrap } from "./runtime/bootstrap.js"

export { create_runtime, run_module, bootstrap }

export async function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) {
    process.stdout.write(
      "Usage: djs_node <entry.js>\nRuns an ES module using the DJS bytecode interpreter.\n",
    )
    return
  }
  if (arguments_.length !== 1 || arguments_[0].startsWith("-")) {
    throw new Error("Usage: djs_node <entry.js>")
  }
  const runtime = create_runtime()
  await bootstrap(runtime)
  await run_module(runtime, arguments_[0])
}

if (
  process.argv[1] &&
  pathToFileURL(realpathSync(resolve(process.argv[1]))).href === import.meta.url
) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`${error.name}: ${error.message}\n`)
    process.exitCode = error.exit_code ?? 1
  }
}
