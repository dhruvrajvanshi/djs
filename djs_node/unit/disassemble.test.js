import assert from "node:assert/strict"
import test from "node:test"
import { compile_module } from "../compiler/compile.ts"
import { disassemble_module } from "../compiler/disassemble.ts"

test("disassembly names opcodes and operands at byte offsets", () => {
  const unit = compile_module("export const value = 42;", "example.js")
  assert.equal(
    disassemble_module(unit),
    'Module "example.js"\n' +
      "Literals:\n" +
      "  0: 42\n" +
      "  1: undefined\n" +
      "\n" +
      'Function 0 "<module>" (params=0, slots=2, bindings=1):\n' +
      "  0: LOAD_CONST dst=0 literal=0\n" +
      "  24: INIT_BINDING depth=0 binding=0 src=0\n" +
      "  48: LOAD_CONST dst=1 literal=1\n" +
      "  72: RETURN src=1\n\n",
  )
})

test("disassembly includes nested functions, branch targets and escaped literals", () => {
  const unit = compile_module(`
    export function outer(value) {
      return function() { if (value) return "hello\\nworld"; return null; };
    }
  `)
  const output = disassemble_module(unit)
  assert.match(output, /Function 0 "<module>"/)
  assert.match(output, /Function 1 "outer" \(params=1/)
  assert.match(output, /Function 2 ""/)
  assert.match(output, /CREATE_CLOSURE dst=\d+ function=2/)
  assert.match(output, /JUMP_IF_FALSY condition=\d+ target=\d+/)
  assert.ok(output.includes('"hello\\nworld"'))
  assert.match(output, /\d+: null\n/)
})
