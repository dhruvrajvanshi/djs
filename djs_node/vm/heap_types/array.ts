import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { Handle } from "../storage/value.ts"
import { set_ref, write_number } from "../storage/value.ts"
import { HEAP_TYPES } from "../storage/layout.ts"
import { write_string } from "./string.ts"
import { set_prototype } from "./object.ts"
import { insert_property } from "./property.ts"

/** An undefined prototype means null. */
export function allocate_array(
  heap: Heap,
  destination: Handle,
  length: number,
  prototype: Handle | undefined,
) {
  if (!Number.isInteger(length) || length < 0 || length > 0xffffffff)
    panic("Invalid array length")
  set_ref(heap, destination, heap.allocate(HEAP_TYPES.ARRAY, 8))
  if (prototype !== undefined) set_prototype(heap, destination, prototype)
  heap.handles.scope(() => {
    const key = heap.handles.local(),
      value = heap.handles.local()
    write_string(heap, key, "length")
    write_number(heap, value, length >>> 0)
    insert_property(heap, destination, key, 1, value)
  })
}
