import { panic } from "../../utils.ts"
import type { Memory } from "../storage/memory.ts"
import type { Root } from "../storage/value.ts"
import { set_ref, write_number } from "../storage/value.ts"
import { KINDS } from "../storage/layout.ts"
import { write_string } from "./string.ts"
import { set_prototype } from "./object.ts"
import { insert_property } from "./property.ts"

/** An undefined prototype means null. */
export function allocate_array(
  memory: Memory,
  destination: Root,
  length: number,
  prototype: Root | undefined,
) {
  if (!Number.isInteger(length) || length < 0 || length > 0xffffffff)
    panic("Invalid array length")
  set_ref(memory, destination, memory.allocate(KINDS.ARRAY, 8))
  if (prototype !== undefined) set_prototype(memory, destination, prototype)
  const key = memory.alloc_root(),
    value = memory.alloc_root()
  try {
    write_string(memory, key, "length")
    write_number(memory, value, length >>> 0)
    insert_property(memory, destination, key, 1, value)
  } finally {
    memory.free_root(key)
    memory.free_root(value)
  }
}
