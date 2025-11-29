import { test, expect } from "vitest"
import { mkdir, readdir, readFile } from "node:fs/promises"
import { main } from "./main.ts"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { execSync, spawn } from "node:child_process"
import * as Path from "node:path"

const files = (await readdir("./tests")).filter((it) => it.endsWith(".ljs"))

test.each(files)("%s", async (file) => {
  await mkdir(`./test-output`, { recursive: true })
  const output = `./test-output/${file.replace(/\.ljs$/, "")}`
  let diagnostics = ""
  const file_source = await readFile(`./tests/${file}`, "utf8")
  if (process.platform === "linux" && file_source.includes("/// skip-linux")) {
    console.log(`skipping ${file} on linux`)
    return
  }

  await main(
    {
      positionals: [`./tests/${file}`],
      values: {
        output: output,
        "no-colors": true,
      },
    },
    {
      show_diagnostics: (d) => (diagnostics += d),
      error_exit: () => {},
    },
  )
  if (diagnostics) {
    await expect(diagnostics).toMatchFileSnapshot(
      `./tests/${file.replace(/\.ljs$/, "")}.diagnostics`,
    )
    return
  }
  assert(existsSync(output))
  const result = await new Promise<{
    stdout: string
    stderr: string
    code: number
  }>((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    const child = spawn(output)
    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })
    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error("Process exited with code " + code + "\n" + stderr))
      } else {
        resolve({ stdout, stderr, code })
      }
    })
  })
  assert.equal(result.code, 0)
  assert.equal(result.stderr, "")

  await expect(result.stdout).toMatchFileSnapshot(
    `./tests/${file.replace(/\.ljs$/, "")}.stdout`,
  )
})

test("examples/sqlite_file_reader", async () => {
  let diagnostics = ""
  await main(
    {
      positionals: ["./examples/sqlite_file_reader/main.ljs"],
      values: {
        output: "test-output/sqlite_file_reader",
        "no-colors": true,
      },
    },
    {
      show_diagnostics: (e) => {
        diagnostics += e
      },
      error_exit: () => {},
    },
  )
  expect(diagnostics).toBe("")
  const result = execSync(
    Path.resolve(import.meta.dirname, "test-output/sqlite_file_reader"),
    {
      cwd: "..",
    },
  )
  expect(result.toString()).toMatchInlineSnapshot(`
    "SQLite file reader
    ==================
    SQLite format 3
    DB page size: 16
    Write file format: Legacy (1)
    Read file format: Legacy (1)
    "
  `)
})
