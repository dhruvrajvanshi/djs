import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { JSValue } from "../storage/heap.ts"
import { VALUE_BYTES, get_ref, set_ref } from "../storage/value.ts"
import { HEAP_TYPES, VALUE_ARRAY } from "../storage/layout.ts"

export function create_value_array(
  heap: Heap,
  destination: JSValue,
  values: JSValue[],
) {
  const reference = heap.allocate(
    HEAP_TYPES.VALUE_ARRAY,
    8 + values.length * VALUE_BYTES,
  )
  set_ref(heap, destination, reference)
  heap.write_u32(reference + VALUE_ARRAY.LENGTH, values.length)
  for (let i = 0; i < values.length; i++)
    heap.store_value(
      reference + VALUE_ARRAY.VALUES + i * VALUE_BYTES,
      values[i],
    )
}

export function load_value_array_element(
  heap: Heap,
  destination: JSValue,
  array: JSValue,
  index: number,
) {
  const reference = get_ref(heap, array)
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= heap.read_u32(reference + VALUE_ARRAY.LENGTH)
  )
    panic("Invalid value array index")
  heap.load_value(
    destination,
    reference + VALUE_ARRAY.VALUES + index * VALUE_BYTES,
  )
}
