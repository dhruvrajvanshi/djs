import { panic } from "../../utils.ts"
import type { Heap } from "../storage/heap.ts"
import type { Handle } from "../storage/heap.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { HEADER, HEAP_TYPES, SYMBOL } from "../storage/layout.ts"

export function create_symbol(
  heap: Heap,
  destination: Handle,
  description?: Handle,
) {
  const reference = heap.allocate(HEAP_TYPES.SYMBOL, 8)
  // Copy before writing the destination, which may alias the description.
  if (description !== undefined)
    heap.store_value(reference + SYMBOL.DESCRIPTION, description)
  set_ref(heap, destination, reference)
}

export function load_symbol_description(
  heap: Heap,
  destination: Handle,
  symbol: Handle,
) {
  const reference = get_ref(heap, symbol)
  if (heap.read_u32(reference + HEADER.TYPE) !== HEAP_TYPES.SYMBOL)
    panic("Expected a symbol")
  heap.load_value(destination, reference + SYMBOL.DESCRIPTION)
}
