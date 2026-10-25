import type { Root, Memory } from "./memory.ts"
import {
  BUILTIN_PROTOTYPE,
  type BuiltinPrototype,
} from "../compiler/bytecode.ts"
import {
  KINDS,
  alloc_root,
  free_root,
  copy_value,
  read_u32,
  write_u32,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
} from "./memory.ts"
import { allocate } from "./heap.ts"
import { set_ref, tag_of, write_null, write_string } from "./values.ts"
import { TAGS } from "./memory.ts"
import {
  kind_of,
  create_object,
  create_array,
  create_string_object,
  set_prototype,
  function_internal_layout,
  set_function_internal_layout,
  object_internal_layout,
  set_object_internal_layout,
} from "./objects.ts"

export const INTERNAL = Object.freeze({
  Call: 0,
  Construct: 1,
  DefineOwnProperty: 2,
})

export function internal_layout(
  memory: Memory,
  value: Root,
  constructor: boolean = false,
) {
  const kind = kind_of(memory, value)
  if (constructor)
    return kind === KINDS.FUNCTION ? function_internal_layout(memory, value) : 0
  return kind === KINDS.ARRAY ||
    kind === KINDS.BUILTIN_OBJECT ||
    kind === KINDS.STRING_OBJECT
    ? object_internal_layout(memory, value)
    : 0
}

export function load_internal_method(
  memory: Memory,
  destination: Root,
  value: Root,
  id: number,
) {
  const layout = internal_layout(memory, value, id < 2)
  if (!layout) return false
  copy_heap_value_to_root(memory, destination, layout + 8 + id * 8)
  return tag_of(memory, destination) !== TAGS.UNDEFINED
}

export function create_builtin_class(
  memory: Memory,
  constructor: Root,
  prototype: Root,
  kind: BuiltinPrototype,
) {
  const layout = allocate(memory, KINDS.INTERNAL_METHODS, 32)
  write_u32(memory, layout + 32, kind)
  set_function_internal_layout(memory, constructor, layout)
  // Ordinary prototypes do not acquire the instances' exotic behavior.
  if (kind === BUILTIN_PROTOTYPE.object) create_object(memory, prototype)
  else
    create_builtin_object(
      memory,
      prototype,
      constructor,
      memory.object_prototype,
    )
}

export function install_internal_method(
  memory: Memory,
  constructor: Root,
  method: Root,
  id: number,
) {
  const layout = internal_layout(memory, constructor, true)
  if (!layout || id > 2 || kind_of(memory, method) !== KINDS.FUNCTION)
    throw new TypeError("Invalid builtin internal method")
  copy_root_to_heap_value(memory, layout + 8 + id * 8, method)
}

export function register_builtin(
  memory: Memory,
  constructor: Root,
  prototype: Root,
  name: string,
) {
  if (name === "Object") {
    if (memory.object_prototype !== undefined)
      throw new TypeError("Object builtin is already registered")
    memory.object_prototype = alloc_root(memory)
    copy_value(memory, memory.object_prototype, prototype)
    return
  }
  if (name === "Symbol") {
    if (memory.symbol_prototype !== undefined)
      throw new TypeError("Symbol builtin is already registered")
    memory.symbol_prototype = alloc_root(memory)
    copy_value(memory, memory.symbol_prototype, prototype)
    return
  }
  if (name !== "Array" && name !== "String") return
  const layout = internal_layout(memory, constructor, true)
  const kind =
    name === "Array" ? BUILTIN_PROTOTYPE.array : BUILTIN_PROTOTYPE.string
  if (!layout || read_u32(memory, layout + 32) !== kind)
    throw new TypeError(`${name} requires a ${name.toLowerCase()} prototype`)
  const class_field = name === "Array" ? "array_class" : "string_class"
  const prototype_field =
    name === "Array" ? "array_prototype" : "string_prototype"
  if (memory[class_field] !== undefined)
    throw new TypeError(`${name} builtin is already registered`)
  memory[class_field] = alloc_root(memory)
  copy_value(memory, memory[class_field], constructor)
  memory[prototype_field] = alloc_root(memory)
  copy_value(memory, memory[prototype_field], prototype)
}

export function create_builtin_object(
  memory: Memory,
  destination: Root,
  constructor: Root,
  prototype?: Root,
) {
  const owner = alloc_root(memory),
    parent = alloc_root(memory)
  try {
    copy_value(memory, owner, constructor)
    if (prototype === undefined) write_null(memory, parent)
    else copy_value(memory, parent, prototype)
    const layout = internal_layout(memory, owner, true)
    if (!layout) throw new TypeError("Expected an intrinsic class")
    const kind = read_u32(memory, layout + 32)
    if (kind === BUILTIN_PROTOTYPE.array)
      create_array(memory, destination, 0, parent)
    else if (kind === BUILTIN_PROTOTYPE.string) {
      const text = alloc_root(memory)
      try {
        write_string(memory, text, "")
        create_string_object(memory, destination, text, parent)
      } finally {
        free_root(memory, text)
      }
    } else {
      set_ref(memory, destination, allocate(memory, KINDS.BUILTIN_OBJECT, 16))
      set_prototype(memory, destination, parent)
    }
    set_object_internal_layout(
      memory,
      destination,
      internal_layout(memory, owner, true),
    )
  } finally {
    free_root(memory, owner)
    free_root(memory, parent)
  }
}
