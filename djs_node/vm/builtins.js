import {
  KINDS,
  alloc_root,
  free_root,
  copy_value,
  read_u32,
  write_u32,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
} from "./memory.js"
import { allocate } from "./heap.js"
import { get_ref, set_ref, tag_of } from "./values.js"
import { TAGS } from "./memory.js"
import { kind_of, create_array, set_prototype } from "./objects.js"

export const INTERNAL = Object.freeze({
  Call: 0,
  Construct: 1,
  DefineOwnProperty: 2,
})

// Functions own the class layout through +36. Exotic instances retain the same
// immutable layout through +16, independently of their mutable prototype chain.
export function internal_layout(memory, value, constructor = false) {
  const kind = kind_of(memory, value)
  if (constructor)
    return kind === KINDS.FUNCTION
      ? read_u32(memory, get_ref(memory, value) + 36)
      : 0
  return kind === KINDS.ARRAY || kind === KINDS.BUILTIN_OBJECT
    ? read_u32(memory, get_ref(memory, value) + 16)
    : 0
}

export function load_internal_method(memory, destination, value, id) {
  const layout = internal_layout(memory, value, id < 2)
  if (!layout) return false
  copy_heap_value_to_root(memory, destination, layout + 8 + id * 8)
  return tag_of(memory, destination) !== TAGS.UNDEFINED
}

export function create_builtin_class(memory, constructor, prototype, array) {
  const layout = allocate(memory, KINDS.INTERNAL_METHODS, 32)
  write_u32(memory, layout + 32, array ? 1 : 0)
  write_u32(memory, get_ref(memory, constructor) + 36, layout)
  // Ordinary prototypes do not acquire the instances' exotic behavior.
  if (array) write_u32(memory, get_ref(memory, prototype) + 16, layout)
}

export function install_internal_method(memory, constructor, method, id) {
  const layout = internal_layout(memory, constructor, true)
  if (!layout || id > 2 || kind_of(memory, method) !== KINDS.FUNCTION)
    throw new TypeError("Invalid builtin internal method")
  copy_root_to_heap_value(memory, layout + 8 + id * 8, method)
}

export function register_builtin(memory, constructor, prototype, name) {
  if (name !== "Array") return
  const layout = internal_layout(memory, constructor, true)
  if (!layout || !read_u32(memory, layout + 32))
    throw new TypeError("Array requires an array prototype")
  if (memory.array_class !== undefined)
    throw new TypeError("Array builtin is already registered")
  memory.array_class = alloc_root(memory)
  copy_value(memory, memory.array_class, constructor)
  memory.array_prototype = alloc_root(memory)
  copy_value(memory, memory.array_prototype, prototype)
}

export function create_builtin_object(
  memory,
  destination,
  constructor,
  prototype,
) {
  const owner = alloc_root(memory),
    parent = alloc_root(memory)
  try {
    copy_value(memory, owner, constructor)
    copy_value(memory, parent, prototype)
    const layout = internal_layout(memory, owner, true)
    if (!layout) throw new TypeError("Expected an intrinsic class")
    if (read_u32(memory, layout + 32))
      create_array(memory, destination, 0, parent)
    else {
      set_ref(memory, destination, allocate(memory, KINDS.BUILTIN_OBJECT, 16))
      set_prototype(memory, destination, parent)
    }
    write_u32(
      memory,
      get_ref(memory, destination) + 16,
      internal_layout(memory, owner, true),
    )
  } finally {
    free_root(memory, owner)
    free_root(memory, parent)
  }
}
