import assert from "node:assert/strict"
import test from "node:test"
import { create_runtime } from "../runtime/modules.js"
import { alloc_root, free_root, TAGS } from "../vm/memory.js"
import { tag_of, write_number, write_string } from "../vm/values.js"
import { call_intrinsic, intrinsic_id } from "../vm/intrinsics.js"

test("write_stdout writes a guest string verbatim and requires a string", () => {
  const writes = []
  const runtime = create_runtime({
    host: { write_stdout: (text) => writes.push(text) },
  })
  const { memory } = runtime
  const value = alloc_root(memory),
    result = alloc_root(memory)
  try {
    const id = intrinsic_id("write_stdout")
    write_string(memory, value, "raw\ntext")
    call_intrinsic(runtime, id, result, [value])
    assert.deepEqual(writes, ["raw\ntext"])
    assert.equal(tag_of(memory, result), TAGS.UNDEFINED)

    write_number(memory, value, 42)
    assert.throws(
      () => call_intrinsic(runtime, id, result, [value]),
      /write_stdout requires a string/,
    )
    assert.throws(
      () => call_intrinsic(runtime, id, result, []),
      /write_stdout requires a string/,
    )
    assert.deepEqual(writes, ["raw\ntext"])
    assert.throws(() => intrinsic_id("console_log"), /Unknown intrinsic/)
    assert.throws(() => intrinsic_id("to_string"), /Unknown intrinsic/)
  } finally {
    free_root(memory, value)
    free_root(memory, result)
  }
})
