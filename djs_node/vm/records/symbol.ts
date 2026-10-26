import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import { get_ref, set_ref } from "../storage/value.ts"
import { HEADER, KINDS, SYMBOL } from "../storage/layout.ts"

export function create_symbol(
  memory: Memory,
  destination: Root,
  description?: Root,
) {
  const reference = memory.allocate(KINDS.SYMBOL, 8)
  // Copy before writing the destination, which may alias the description.
  if (description !== undefined)
    memory.copy_root_to_heap_value(reference + SYMBOL.DESCRIPTION, description)
  set_ref(memory, destination, reference)
}

export function load_symbol_description(
  memory: Memory,
  destination: Root,
  symbol: Root,
) {
  const reference = get_ref(memory, symbol)
  if (memory.read_u32(reference + HEADER.KIND) !== KINDS.SYMBOL)
    panic("Expected a symbol")
  memory.copy_heap_value_to_root(destination, reference + SYMBOL.DESCRIPTION)
}
