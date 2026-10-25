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
import { alloc_root, free_root, KINDS } from "../vm/memory.ts"
import { get_ref } from "../vm/values.ts"
import { INTRINSIC_NAMES } from "../vm/intrinsics.ts"
import { collect, heap_stats } from "../vm/heap.ts"
import { kind_of, store_binding } from "../vm/objects.ts"

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
