import assert from "node:assert/strict"
import test from "node:test"
import {
  create_runtime,
  evaluate_module,
  load_module,
  module_status,
  MODULE_STATE,
  read_export,
} from "../runtime/modules.ts"
import { alloc_root, free_root, KINDS, TAGS } from "../vm/memory.ts"
import {
  get_ref,
  tag_of,
  write_number,
  write_string,
  read_string,
  read_number,
  read_boolean,
} from "../vm/values.ts"
import {
  call_intrinsic,
  intrinsic_id,
  INTRINSIC_NAMES,
} from "../vm/intrinsics.ts"
import { collect, heap_stats } from "../vm/heap.ts"
import { kind_of, store_binding, get_property } from "../vm/objects.ts"

test("djs:intrinsics is a cached virtual module whose exports survive moving GC", async () => {
  const runtime = create_runtime({
    semispace_bytes: 8192,
    root_capacity: 1,
    host: {
      read_text() {
        assert.fail("The virtual module must not read source from the host")
      },
    },
  })
  const module = await load_module(runtime, "djs:intrinsics")
  assert.equal(module_status(module), MODULE_STATE.EVALUATED)
  assert.deepEqual([...module.exports.keys()], INTRINSIC_NAMES)
  const roots = heap_stats(runtime.memory).roots
  assert.equal(await load_module(runtime, "djs:intrinsics"), module)
  assert.equal(await evaluate_module(runtime, module), module)
  assert.equal(runtime.code.length, 0)
  assert.equal(runtime.contexts.length, 0)
  const value = alloc_root(runtime.memory),
    saved = alloc_root(runtime.memory)
  try {
    for (const name of INTRINSIC_NAMES) {
      read_export(runtime, module, name, saved)
      collect(runtime.memory)
      read_export(runtime, module, name, value)
      assert.equal(kind_of(runtime.memory, value), KINDS.FUNCTION)
      assert.equal(
        get_ref(runtime.memory, value),
        get_ref(runtime.memory, saved),
      )
      assert.throws(
        () =>
          store_binding(
            runtime,
            module.environment,
            module.exports.get(name),
            value,
          ),
        /constant binding/,
      )
    }
  } finally {
    free_root(runtime.memory, value)
    free_root(runtime.memory, saved)
  }
  assert.equal(heap_stats(runtime.memory).roots, roots)
})

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

test("UTF-16 primitives copy ranges across moving GC and support aliased destinations", () => {
  const runtime = create_runtime({ semispace_bytes: 256, root_capacity: 1 })
  const { memory } = runtime
  const roots = heap_stats(memory).roots
  const source = alloc_root(memory),
    destination = alloc_root(memory),
    start = alloc_root(memory),
    end = alloc_root(memory),
    garbage = alloc_root(memory)
  try {
    write_string(memory, source, "A\ud800\udc00B")
    write_number(memory, start, 1)
    write_number(memory, end, 3)
    for (let index = 0; index < 40; index++) {
      write_string(memory, garbage, "discarded allocation")
      call_intrinsic(runtime, intrinsic_id("string_slice"), destination, [
        source,
        start,
        end,
      ])
      assert.equal(read_string(memory, destination), "\ud800\udc00")
    }
    assert.ok(heap_stats(memory).collections > 2)
    call_intrinsic(runtime, intrinsic_id("string_code_unit_at"), destination, [
      source,
      start,
    ])
    assert.equal(read_number(memory, destination), 0xd800)
    call_intrinsic(runtime, intrinsic_id("string_slice"), source, [
      source,
      start,
      end,
    ])
    collect(memory)
    assert.equal(read_string(memory, source), "\ud800\udc00")
    assert.throws(
      () =>
        call_intrinsic(runtime, intrinsic_id("string_slice"), destination, [
          source,
          start,
          end,
        ]),
      /Invalid string range/,
    )
    write_number(memory, start, 2)
    assert.throws(
      () =>
        call_intrinsic(
          runtime,
          intrinsic_id("string_code_unit_at"),
          destination,
          [source, start],
        ),
      /Invalid string index/,
    )
  } finally {
    for (const root of [source, destination, start, end, garbage])
      free_root(memory, root)
  }
  assert.equal(heap_stats(memory).roots, roots)
})

test("array allocation is sparse and brands survive moving collection", () => {
  const runtime = create_runtime({ semispace_bytes: 256, root_capacity: 1 })
  const { memory } = runtime
  const length = alloc_root(memory),
    array = alloc_root(memory),
    result = alloc_root(memory),
    key = alloc_root(memory)
  try {
    write_number(memory, length, 0xffffffff)
    call_intrinsic(runtime, intrinsic_id("array_create"), array, [length])
    collect(memory)
    call_intrinsic(runtime, intrinsic_id("is_array"), result, [array])
    assert.equal(read_boolean(memory, result), true)
    write_string(memory, key, "length")
    get_property(memory, result, array, key)
    assert.equal(read_number(memory, result), 0xffffffff)
    assert.ok(heap_stats(memory).used_bytes < 200)
    write_number(memory, length, 1.5)
    assert.throws(
      () =>
        call_intrinsic(runtime, intrinsic_id("array_create"), result, [length]),
      /Invalid array length/,
    )
  } finally {
    for (const root of [length, array, result, key]) free_root(memory, root)
  }
})
