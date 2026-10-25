import test from "node:test"
import assert from "node:assert/strict"
import {
  KINDS,
  NAN_HIGH,
  TAGS,
  alloc_root,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
  create_memory,
  free_root,
  read_u32,
  write_u32,
} from "../vm/memory.ts"
import { allocate, collect, heap_stats } from "../vm/heap.ts"
import {
  get_ref,
  read_number,
  read_string,
  set_ref,
  tag_of,
  write_number,
  write_string,
  write_undefined,
  create_symbol,
  load_symbol_description,
} from "../vm/values.ts"
import { create_object, define_property, get_property } from "../vm/objects.ts"

test("number slots canonicalize NaN and preserve binary64 values", () => {
  const memory = create_memory()
  const root = alloc_root(memory)
  for (const number of [-0, 0, 1.5, -Infinity, Infinity, Number.MIN_VALUE]) {
    write_number(memory, root, number)
    assert.ok(Object.is(read_number(memory, root), number))
    assert.equal(tag_of(memory, root), TAGS.NUMBER)
  }
  const unusual_nan = new DataView(new ArrayBuffer(8))
  unusual_nan.setUint32(0, 0x12345678, true)
  unusual_nan.setUint32(4, NAN_HIGH | TAGS.REF, true)
  write_number(memory, root, unusual_nan.getFloat64(0, true))
  assert.ok(Number.isNaN(read_number(memory, root)))
  assert.equal(memory.roots_view.getUint32(root * 8, true), 0)
  assert.equal(memory.roots_view.getUint32(root * 8 + 4, true), NAN_HIGH)
})

test("strings retain UTF-16 code units through repeated moving collections", () => {
  const memory = create_memory({ semispace_bytes: 64 })
  const root = alloc_root(memory)
  const garbage = alloc_root(memory)
  const text = "a\0\ud800\udc00\udfff"
  write_string(memory, root, text)
  const before = get_ref(memory, root)
  write_string(memory, garbage, "dead")
  free_root(memory, garbage)
  collect(memory)
  assert.notEqual(get_ref(memory, root), before)
  assert.equal(read_string(memory, root), text)
  assert.equal(heap_stats(memory).used_bytes, 24)
  collect(memory)
  assert.equal(read_string(memory, root), text)
  assert.equal(get_ref(memory, root), before)
})

test("symbols keep identity and descriptions as property keys through moving collections", () => {
  const memory = create_memory({ semispace_bytes: 1024 })
  const symbol = alloc_root(memory)
  const object = alloc_root(memory)
  const value = alloc_root(memory)
  write_string(memory, value, "description")
  create_symbol(memory, symbol, value)
  create_object(memory, object)
  write_number(memory, value, 7)
  define_property(memory, object, symbol, value)
  const before = get_ref(memory, symbol)
  collect(memory)
  assert.notEqual(get_ref(memory, symbol), before)
  load_symbol_description(memory, value, symbol)
  assert.equal(read_string(memory, value), "description")
  get_property(memory, value, object, symbol)
  assert.equal(read_number(memory, value), 7)
  write_string(memory, value, "description")
  get_property(memory, value, object, value)
  assert.equal(tag_of(memory, value), TAGS.UNDEFINED)
})

function record(memory, kind, payload_bytes) {
  const root = alloc_root(memory)
  set_ref(memory, root, allocate(memory, kind, payload_bytes))
  return root
}

test("Cheney tracing updates nested raw pointers, tagged fields, aliases and cycles", () => {
  const memory = create_memory({ semispace_bytes: 1024 })
  const key = alloc_root(memory)
  const result = alloc_root(memory)
  write_string(memory, key, "key")
  write_string(memory, result, "result")
  const private_values = record(memory, KINDS.VALUE_ARRAY, 16)
  write_u32(memory, get_ref(memory, private_values) + 8, 1)
  copy_root_to_heap_value(memory, get_ref(memory, private_values) + 16, result)
  const parent = record(memory, KINDS.ENVIRONMENT, 16)
  const environment = record(memory, KINDS.ENVIRONMENT, 32)
  write_u32(memory, get_ref(memory, environment) + 16, 2)
  copy_root_to_heap_value(memory, get_ref(memory, environment) + 8, parent)
  const fn = record(memory, KINDS.FUNCTION, 48)
  write_u32(memory, get_ref(memory, fn) + 8, 123)
  write_u32(memory, get_ref(memory, fn) + 12, 456)
  copy_root_to_heap_value(memory, get_ref(memory, fn) + 16, environment)
  const property = record(memory, KINDS.PROPERTY, 24)
  copy_root_to_heap_value(memory, get_ref(memory, property) + 16, key)
  copy_root_to_heap_value(memory, get_ref(memory, property) + 24, fn)
  const object = record(memory, KINDS.OBJECT, 8)
  write_u32(memory, get_ref(memory, object) + 8, get_ref(memory, property))
  write_u32(memory, get_ref(memory, object) + 12, get_ref(memory, object))
  const array = record(memory, KINDS.VALUE_ARRAY, 24)
  write_u32(memory, get_ref(memory, array) + 8, 2)
  copy_root_to_heap_value(memory, get_ref(memory, array) + 16, object)
  copy_root_to_heap_value(memory, get_ref(memory, array) + 24, private_values)
  copy_root_to_heap_value(memory, get_ref(memory, environment) + 24, array)
  copy_root_to_heap_value(
    memory,
    get_ref(memory, environment) + 32,
    private_values,
  )
  for (const root of [
    key,
    result,
    private_values,
    parent,
    environment,
    fn,
    property,
    object,
  ]) {
    free_root(memory, root)
  }
  const scratch = alloc_root(memory)
  for (let pass = 0; pass < 3; pass++) {
    write_undefined(memory, scratch)
    const previous_array = get_ref(memory, array)
    collect(memory)
    assert.notEqual(get_ref(memory, array), previous_array)
    copy_heap_value_to_root(memory, scratch, get_ref(memory, array) + 16)
    const moved_object = get_ref(memory, scratch)
    assert.equal(read_u32(memory, moved_object + 12), moved_object)
    const moved_property = read_u32(memory, moved_object + 8)
    copy_heap_value_to_root(memory, scratch, moved_property + 16)
    assert.equal(read_string(memory, scratch), "key")
    copy_heap_value_to_root(memory, scratch, moved_property + 24)
    const moved_fn = get_ref(memory, scratch)
    assert.equal(read_u32(memory, moved_fn + 8), 123)
    assert.equal(read_u32(memory, moved_fn + 12), 456)
    copy_heap_value_to_root(memory, scratch, moved_fn + 16)
    const moved_environment = get_ref(memory, scratch)
    copy_heap_value_to_root(memory, scratch, moved_environment + 8)
    assert.equal(read_u32(memory, get_ref(memory, scratch)), KINDS.ENVIRONMENT)
    copy_heap_value_to_root(memory, scratch, moved_environment + 24)
    assert.equal(get_ref(memory, scratch), get_ref(memory, array))
    copy_heap_value_to_root(memory, scratch, moved_environment + 32)
    const moved_private_values = get_ref(memory, scratch)
    copy_heap_value_to_root(memory, scratch, get_ref(memory, array) + 24)
    assert.equal(get_ref(memory, scratch), moved_private_values)
    copy_heap_value_to_root(memory, scratch, moved_private_values + 16)
    assert.equal(read_string(memory, scratch), "result")
  }
})
