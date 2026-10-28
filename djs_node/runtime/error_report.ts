import type { JSValue } from "../vm/storage/heap.ts"
import { VALUE_TAGS, heap_type_of, tag_of } from "../vm/storage/value.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import { read_string } from "../vm/heap_types/string.ts"
import { is_object } from "../vm/heap_types/object.ts"
import {
  get_property_descriptor,
  is_data_descriptor,
} from "../vm/properties.ts"
import { to_string } from "../vm/operations.ts"
import type { Runtime } from "./runtime.ts"

// The value's stack if it has one, since that already starts with its message.
export function error_report(runtime: Runtime, value: JSValue) {
  const { heap } = runtime
  if (!is_object(heap, value)) return to_string(runtime, value)
  return heap.handles.scope(() => {
    const stack = get_property_descriptor(runtime, value, "stack")
    if (
      stack &&
      is_data_descriptor(stack) &&
      tag_of(heap, stack.value!) === VALUE_TAGS.REF &&
      heap_type_of(heap, stack.value!) === HEAP_TYPES.STRING
    )
      return read_string(heap, stack.value!)
    return to_string(runtime, value)
  })
}
