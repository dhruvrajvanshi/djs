import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import { VALUE_BYTES, get_ref, set_ref } from "../storage/value.ts"
import { KINDS, VALUE_ARRAY } from "../storage/layout.ts"

export function create_value_array(
  memory: Memory,
  destination: Root,
  values: Root[],
) {
  const reference = memory.allocate(
    KINDS.VALUE_ARRAY,
    8 + values.length * VALUE_BYTES,
  )
  set_ref(memory, destination, reference)
  memory.write_u32(reference + VALUE_ARRAY.LENGTH, values.length)
  for (let i = 0; i < values.length; i++)
    memory.copy_root_to_heap_value(
      reference + VALUE_ARRAY.VALUES + i * VALUE_BYTES,
      values[i],
    )
}

export function load_value_array_element(
  memory: Memory,
  destination: Root,
  array: Root,
  index: number,
) {
  const reference = get_ref(memory, array)
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= memory.read_u32(reference + VALUE_ARRAY.LENGTH)
  )
    panic("Invalid value array index")
  memory.copy_heap_value_to_root(
    destination,
    reference + VALUE_ARRAY.VALUES + index * VALUE_BYTES,
  )
}
