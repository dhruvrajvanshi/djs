import assert from "node:assert/strict"
import test from "node:test"
import { compile_module } from "../compiler/compile.ts"
import { disassemble_module } from "../compiler/disassemble.ts"

test("disassembly names opcodes and operands at byte offsets", () => {
  const unit = compile_module("export const value = 42;", "example.js")
  assert.equal(
    disassemble_module(unit),
    'Module "example.js"\n' +
      "\n" +
      "function <module>() #0  ; slots=2, bindings=1\n" +
      "   0: %0 = LOAD_CONST 42\n" +
      "  24: INIT_BINDING env[0].0, %0\n" +
      "  48: %1 = LOAD_CONST undefined\n" +
      "  72: RETURN %1\n\n",
  )
})

test("disassembly includes nested functions, branch targets and escaped literals", () => {
  const unit = compile_module(`
    export function outer(value) {
      return function() { if (value) return "hello\\nworld"; return null; };
    }
  `)
  const output = disassemble_module(unit)
  assert.match(output, /function <module>\(\) #0/)
  assert.match(output, /function outer\(env\[0\]\.0\) #1/)
  assert.match(output, /function \(\) #2/)
  assert.match(output, /%\d+ = CREATE_CLOSURE fn#2 ""/)
  assert.match(output, /JUMP_IF_FALSY %\d+, @\d+/)
  assert.ok(output.includes('LOAD_CONST "hello\\nworld"'))
  assert.match(output, /LOAD_CONST null\n/)
})
