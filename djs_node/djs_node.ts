#!/usr/bin/env node
import { resolve } from "node:path"
import { realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { compile_module } from "./compiler/compile.ts"
import { disassemble_module } from "./compiler/disassemble.ts"
import { Runtime, run_module } from "./runtime/modules.ts"
import { bootstrap } from "./runtime/bootstrap.ts"

export { Runtime, run_module, bootstrap }

const USAGE =
  "Usage: djs_node <entry.js>\n       djs_node --dump-ir <module.js>..."

export async function main(arguments_: string[] = process.argv.slice(2)) {
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) {
    process.stdout.write(
      `${USAGE}\nRuns an ES module using the DJS bytecode interpreter.\n` +
        "--dump-ir  Print bytecode for each supplied module without executing it.\n",
    )
    return
  }
  const modules = []
  let dump_ir = false
  let options = true
  for (const argument of arguments_) {
    if (options && argument === "--") options = false
    else if (options && argument === "--dump-ir") dump_ir = true
    else if (options && argument.startsWith("-")) throw new Error(USAGE)
    else modules.push(argument)
  }
  if (modules.length === 0 || (!dump_ir && modules.length !== 1)) {
    throw new Error(USAGE)
  }
  if (dump_ir) {
    for (const path of modules) {
      const source = await readFile(path, "utf8")
      process.stdout.write(disassemble_module(compile_module(source, path)))
    }
    return
  }
  const runtime = new Runtime()
  await bootstrap(runtime)
  await run_module(runtime, modules[0])
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
