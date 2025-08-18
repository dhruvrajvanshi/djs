import { test } from "vitest"
import { mkdir, readdir, readFile } from "node:fs/promises"
import { main } from "./main.ts"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { exec, spawn } from "node:child_process"

const files = (await readdir("./tests")).filter((it) => it.endsWith(".ljs"))

test.each(files)("%s", async (file) => {
  const expected_stdout = await readFile(
    `./tests/${file.replace(/\.ljs$/, "")}.stdout`,
    "utf-8",
  )
  await mkdir(`./test-output`, { recursive: true })
  const output = `./test-output/${file.replace(/\.ljs$/, "")}`

  await main({
    positionals: [`./tests/${file}`],
    values: {
      output: output,
    },
  })
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
      console.log("Stdout", data.toString())
      stdout += data.toString()
    })
    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })
    child.on("exit", (code) => {
      console.log("Exit code", code, stdout)
      if (code !== 0) {
        reject(new Error("Process exited with code " + code + "\n" + stderr))
      } else {
        resolve({ stdout, stderr, code })
      }
    })
  })
  console.log(result)
  assert.equal(result.code, 0)
  assert.equal(result.stderr, "")
  assert.equal(result.stdout, expected_stdout)
})
