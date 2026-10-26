import assert from "node:assert/strict"
import test from "node:test"
import { compile_module, decode_string } from "../compiler/compile.ts"
import {
  decode_instruction,
  encode_instructions,
  INSTRUCTION_BYTES,
  OP,
} from "../compiler/bytecode.ts"

function instructions(fn) {
  const bytes = fn.bytecode
  return Array.from({ length: bytes.length / INSTRUCTION_BYTES }, (_, i) =>
    decode_instruction(bytes, i * INSTRUCTION_BYTES),
  )
}

test("source strings decode escapes without host execution", () => {
  assert.equal(
    decode_string("'it\\'s \\x41\\u0042\\u{1f600}\\n'"),
    "it's AB😀\n",
  )
  assert.equal(decode_string('"line\\\ncontinued"'), "linecontinued")
  assert.throws(() => decode_string("'\\u{110000}'"), SyntaxError)
  assert.throws(() => decode_string("'\\012'"), SyntaxError)
  const code = compile_module("console.log('hello\\nworld');")
  assert.ok(code.literals.includes("hello\nworld"))
})

test("instruction format is fixed-width little endian and checked", () => {
  const bytes = encode_instructions([[OP.LOAD_CONST, 0x12345678, 3]])
  assert.equal(bytes.length, INSTRUCTION_BYTES)
  assert.deepEqual([...bytes.slice(4, 8)], [0x78, 0x56, 0x34, 0x12])
  assert.equal(decode_instruction(bytes, 0).a, 0x12345678)
  assert.throws(() => decode_instruction(bytes, 1), RangeError)
  assert.throws(() => encode_instructions([[OP.JUMP, -1]]), RangeError)
})

test("ordinary function closures resolve shared mutable cells", () => {
  const code = compile_module(`
    let count = 0;
    function make(start) {
      let step = start;
      return function() { count = count + step; return count; };
    }
    const next = make(2);
    next();
  `)
  assert.equal(code.functions.length, 3)
  assert.deepEqual(code.functions[1].parameters, [{ register: 0 }])
  assert.deepEqual(code.functions[1].binding_flags, [false])
  const closure = instructions(code.functions[2])
  assert.ok(
    closure.some(
      (op) => op.opcode === OP.LOAD_BINDING && op.b === 2 && op.c === 0,
    ),
  )
  assert.ok(
    closure.some(
      (op) => op.opcode === OP.LOAD_BINDING && op.b === 1 && op.c === 0,
    ),
  )
  assert.ok(
    closure.some(
      (op) => op.opcode === OP.STORE_BINDING && op.a === 2 && op.b === 0,
    ),
  )
})

test("block shadowing uses distinct variables and temporal-dead-zone checks", () => {
  const code = compile_module(
    "let x = 1; { console.log(x); let x = 2; } console.log(x);",
  )
  assert.equal(code.functions[0].binding_count, 1)
  const ops = instructions(code.functions[0])
  assert.ok(
    ops.some(
      (op) =>
        op.opcode === OP.THROW_ERROR &&
        code.literals[op.a] === "ReferenceError",
    ),
  )
  assert.deepEqual(
    ops.filter((op) => op.opcode === OP.LOAD_BINDING).map((op) => op.c),
    [0],
  )
})

test("module metadata links default and named imports and exports", () => {
  const code = compile_module(
    `
    import fs, { readFile as read } from 'node:fs/promises';
    export const result = await fs.readFile('fixture.txt', 'utf8');
    export function get() { return result; }
    export default { read, get };
  `,
    "entry.js",
  )
  assert.deepEqual(code.imports, [
    {
      specifier: "node:fs/promises",
      bindings: [
        { imported: "default", slot: 0 },
        { imported: "readFile", slot: 1 },
      ],
    },
  ])
  assert.deepEqual(code.exports, [
    { name: "result", slot: 2 },
    { name: "get", slot: 3 },
    { name: "default", slot: 4 },
  ])
  assert.deepEqual(code.functions[0].binding_flags, [
    true,
    true,
    true,
    false,
    true,
  ])
  assert.ok(
    instructions(code.functions[0]).some((op) => op.opcode === OP.AWAIT),
  )
})

test("side-effect imports remain dependencies without binding slots", () => {
  const code = compile_module(
    "import './dependency.js'; export default 42;",
    "entry.js",
  )
  assert.deepEqual(code.imports, [
    { specifier: "./dependency.js", bindings: [] },
  ])
  assert.equal(code.functions[0].binding_count, 1)
})

test("method calls preserve receiver and reserve consecutive argument slots", () => {
  const code = compile_module("console.log(1, nested(2), 3);")
  const ops = instructions(code.functions[0])
  const calls = ops.filter((op) => op.opcode === OP.CALL)
  assert.equal(calls.length, 2)
  const outer = calls[1]
  assert.equal(outer.e, 3)
  assert.deepEqual(
    ops
      .filter(
        (op) => op.opcode === OP.MOVE && op.a >= outer.d && op.a < outer.d + 3,
      )
      .map((op) => op.a),
    [outer.d, outer.d + 1, outer.d + 2],
  )
  const property = ops.find((op) => op.opcode === OP.GET_PROP)
  assert.equal(outer.b, property.a)
  assert.equal(outer.c, property.b)
})

test("intrinsic values compile as ordinary named imports", () => {
  const code = compile_module(
    'import { write_stdout as write } from "djs:native"; export default { log: function(value) { write(value); } };',
    "console.js",
  )
  assert.deepEqual(code.imports, [
    {
      specifier: "djs:native",
      bindings: [{ imported: "write_stdout", slot: 0 }],
    },
  ])
  assert.equal(code.functions[1].params, 1)
})

test("compilation metadata and instruction storage cannot be changed by consumers", () => {
  const code = compile_module("const value = 1;")
  assert.ok(Object.isFrozen(code))
  assert.ok(Object.isFrozen(code.functions[0]))
  assert.throws(() => {
    code.functions[0].binding_flags[0] = false
  }, TypeError)
  const bytes = code.functions[0].bytecode
  bytes.fill(0)
  assert.equal(
    decode_instruction(code.functions[0].bytecode, 0).opcode,
    OP.LOAD_CONST,
  )
})

test("new.target requires an enclosing ordinary function", () => {
  assert.throws(
    () => compile_module("new.target"),
    /new.target requires a function/,
  )
  assert.throws(
    () => compile_module("() => new.target"),
    /new.target requires a function/,
  )
  assert.throws(
    () => compile_module("delete variable"),
    /Cannot delete a binding/,
  )
})

test("invalid and unsupported syntax fails clearly", () => {
  assert.throws(
    () => compile_module("function invalid(...items, last) {}"),
    /rest parameter must be last/,
  )
  assert.throws(
    () => compile_module("function invalid(...items = 1) {}"),
    /rest parameter must be last and cannot have a default/,
  )
  assert.throws(() => compile_module("const x = ;"), SyntaxError)
  assert.throws(
    () => compile_module("let x = 1; let x = 2;"),
    /Duplicate binding/,
  )
  assert.throws(() => compile_module("const x = [...items]"), /array spread/)
  assert.throws(() => compile_module("var x = 1"), /Unsupported syntax: var/)
  assert.throws(() => compile_module("break;"), /not inside a loop/)
  assert.throws(
    () => compile_module("while (true) { function f() { continue; } }"),
    /Illegal continue statement/,
  )
  assert.throws(
    () => compile_module("outer: while (true) break outer;"),
    /Unsupported syntax/,
  )
  assert.throws(
    () => compile_module("function* f() {}"),
    /Unsupported syntax: generator functions/,
  )
  assert.throws(
    () => compile_module("if (true) function f() {}"),
    /function declarations outside blocks/,
  )
  assert.throws(
    () => compile_module("if (true) import 'dependency';"),
    /nested import/,
  )
  assert.throws(
    () => compile_module("function f() { return await Promise.resolve(1); }"),
    /await inside an ordinary function/,
  )
  assert.throws(() => compile_module("return 1;"), /Illegal return at module/)
  assert.throws(
    () => compile_module("function f(x, x) {}"),
    /Duplicate binding/,
  )
})
