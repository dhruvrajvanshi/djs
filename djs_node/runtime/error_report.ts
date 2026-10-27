import type { Handle } from "../vm/storage/heap.ts"
import { VALUE_TAGS, heap_type_of, tag_of } from "../vm/storage/value.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import { read_string, write_string } from "../vm/heap_types/string.ts"
import { is_object } from "../vm/heap_types/object.ts"
import { load_property } from "../vm/semantics/properties.ts"
import { to_string } from "../vm/semantics/operations.ts"
import type { Runtime } from "./runtime.ts"

// The value's stack if it has one, since that already starts with its message.
export function error_report(runtime: Runtime, value: Handle) {
  const { heap } = runtime
  if (!is_object(heap, value)) return to_string(runtime, value)
  return heap.handles.scope(() => {
    const key = heap.handles.local(),
      stack = heap.handles.local()
    write_string(heap, key, "stack")
    const accessor = load_property(runtime, stack, value, key)
    if (
      !accessor &&
      tag_of(heap, stack) === VALUE_TAGS.REF &&
      heap_type_of(heap, stack) === HEAP_TYPES.STRING
    )
      return read_string(heap, stack)
    return to_string(runtime, value)
  })
}
