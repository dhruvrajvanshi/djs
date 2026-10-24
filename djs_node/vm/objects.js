import {
  KINDS,
  TAGS,
  alloc_root,
  free_root,
  copy_value,
  read_u32,
  write_u32,
  copy_heap_value_to_root,
  copy_root_to_heap_value,
} from "./memory.js"
import {
  get_ref,
  set_ref,
  tag_of,
  read_string,
  read_number,
  read_boolean,
  write_undefined,
  write_uninitialized,
  write_number,
  write_string,
  write_boolean,
} from "./values.js"
import { allocate } from "./heap.js"

export function kind_of(memory, value) {
  return tag_of(memory, value) === TAGS.REF
    ? read_u32(memory, get_ref(memory, value))
    : 0
}

export function create_object(memory, destination) {
  set_ref(memory, destination, allocate(memory, KINDS.OBJECT, 8))
}

export function create_function(
  memory,
  destination,
  code_id,
  function_id,
  environment,
) {
  const reference = allocate(memory, KINDS.FUNCTION, 16)
  set_ref(memory, destination, reference)
  write_u32(memory, reference + 8, code_id)
  write_u32(memory, reference + 12, function_id)
  if (environment !== undefined)
    copy_root_to_heap_value(memory, reference + 16, environment)
}

export function create_environment(
  memory,
  destination,
  parent,
  binding_count,
  scope_id,
) {
  const reference = allocate(memory, KINDS.ENVIRONMENT, 16 + binding_count * 8)
  set_ref(memory, destination, reference)
  if (parent !== undefined)
    copy_root_to_heap_value(memory, reference + 8, parent)
  write_u32(memory, reference + 16, binding_count)
  write_u32(memory, reference + 20, scope_id)
  const temporary = alloc_root(memory)
  try {
    write_uninitialized(memory, temporary)
    for (let slot = 0; slot < binding_count; slot++) {
      copy_root_to_heap_value(memory, reference + 24 + slot * 8, temporary)
    }
  } finally {
    free_root(memory, temporary)
  }
}

export function environment_at(memory, destination, environment, depth) {
  copy_value(memory, destination, environment)
  for (let index = 0; index < depth; index++) {
    copy_heap_value_to_root(
      memory,
      destination,
      get_ref(memory, destination) + 8,
    )
  }
  if (kind_of(memory, destination) !== KINDS.ENVIRONMENT)
    throw new Error("Invalid lexical environment")
}

export function load_binding(runtime, destination, environment, slot) {
  const { memory } = runtime
  const reference = get_ref(memory, environment)
  if (slot >= read_u32(memory, reference + 16))
    throw new RangeError("Invalid binding slot")
  const scope = runtime.scopes[read_u32(memory, reference + 20)]
  const imported = scope.import_bindings?.get(slot)
  if (imported) {
    load_binding(
      runtime,
      destination,
      runtime.modules[imported.module_id].environment,
      imported.slot,
    )
    return
  }
  copy_heap_value_to_root(memory, destination, reference + 24 + slot * 8)
  if (tag_of(memory, destination) === TAGS.UNINITIALIZED)
    throw new ReferenceError("Cannot access binding before initialization")
}

export function store_binding(
  runtime,
  environment,
  slot,
  source,
  initialize = false,
) {
  const { memory } = runtime
  const reference = get_ref(memory, environment)
  if (slot >= read_u32(memory, reference + 16))
    throw new RangeError("Invalid binding slot")
  const scope = runtime.scopes[read_u32(memory, reference + 20)]
  if (scope.import_bindings?.has(slot))
    throw new TypeError("Cannot assign to an imported binding")
  const previous = alloc_root(memory)
  try {
    copy_heap_value_to_root(memory, previous, reference + 24 + slot * 8)
    const uninitialized = tag_of(memory, previous) === TAGS.UNINITIALIZED
    if (!initialize && uninitialized)
      throw new ReferenceError("Cannot access binding before initialization")
    if (initialize && !uninitialized)
      throw new ReferenceError("Binding is already initialized")
    if (!initialize && scope.binding_flags[slot])
      throw new TypeError("Assignment to constant binding")
    copy_root_to_heap_value(memory, reference + 24 + slot * 8, source)
  } finally {
    free_root(memory, previous)
  }
}

function find_property(memory, object, name) {
  let reference = get_ref(memory, object)
  const key = alloc_root(memory)
  try {
    while (reference !== 0) {
      if (read_u32(memory, reference) !== KINDS.OBJECT)
        throw new TypeError("Expected an object")
      let property = read_u32(memory, reference + 8)
      while (property !== 0) {
        copy_heap_value_to_root(memory, key, property + 16)
        if (read_string(memory, key) === name) return property
        property = read_u32(memory, property + 8)
      }
      reference = read_u32(memory, reference + 12)
    }
    return 0
  } finally {
    free_root(memory, key)
  }
}

export function get_property(memory, destination, object, key) {
  const name = to_string(memory, key)
  if (kind_of(memory, object) === KINDS.STRING && name === "length") {
    write_number(
      memory,
      destination,
      read_u32(memory, get_ref(memory, object) + 8),
    )
    return
  }
  const property = find_property(memory, object, name)
  if (property === 0) write_undefined(memory, destination)
  else copy_heap_value_to_root(memory, destination, property + 24)
}

export function set_property(memory, object, key, value) {
  if (kind_of(memory, object) !== KINDS.OBJECT)
    throw new TypeError("Expected an object")
  const property = find_property(memory, object, to_string(memory, key))
  if (property !== 0) {
    copy_root_to_heap_value(memory, property + 24, value)
    return
  }
  const normalized_key = alloc_root(memory)
  try {
    if (kind_of(memory, key) === KINDS.STRING)
      copy_value(memory, normalized_key, key)
    else write_string(memory, normalized_key, to_string(memory, key))
    // All inputs are root handles; allocation may relocate every input object.
    const reference = allocate(memory, KINDS.PROPERTY, 24)
    const object_reference = get_ref(memory, object)
    write_u32(memory, reference + 8, read_u32(memory, object_reference + 8))
    write_u32(memory, reference + 12, 7) // writable, enumerable, configurable
    copy_root_to_heap_value(memory, reference + 16, normalized_key)
    copy_root_to_heap_value(memory, reference + 24, value)
    write_u32(memory, object_reference + 8, reference)
  } finally {
    free_root(memory, normalized_key)
  }
}

export function to_string(memory, value) {
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
      return "undefined"
    case TAGS.NULL:
      return "null"
    case TAGS.NUMBER:
      return String(read_number(memory, value))
    case TAGS.BOOLEAN:
      return String(read_boolean(memory, value))
    case TAGS.REF:
      switch (kind_of(memory, value)) {
        case KINDS.STRING:
          return read_string(memory, value)
        case KINDS.FUNCTION:
          return "[Function]"
        case KINDS.PROMISE:
          return "[object Promise]"
        default:
          return "[object Object]"
      }
    default:
      throw new ReferenceError("Invalid internal value exposed to guest code")
  }
}

export function truthy(memory, value) {
  switch (tag_of(memory, value)) {
    case TAGS.UNDEFINED:
    case TAGS.NULL:
      return false
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.NUMBER:
      return Boolean(read_number(memory, value))
    case TAGS.REF:
      return (
        kind_of(memory, value) !== KINDS.STRING ||
        read_string(memory, value).length !== 0
      )
    default:
      throw new ReferenceError("Invalid internal value")
  }
}

function primitive(memory, value) {
  switch (tag_of(memory, value)) {
    case TAGS.NUMBER:
      return read_number(memory, value)
    case TAGS.UNDEFINED:
      return undefined
    case TAGS.NULL:
      return null
    case TAGS.BOOLEAN:
      return read_boolean(memory, value)
    case TAGS.REF:
      if (kind_of(memory, value) === KINDS.STRING)
        return read_string(memory, value)
      throw new TypeError("Object coercion is not implemented yet")
    default:
      throw new ReferenceError("Invalid internal value")
  }
}

export function write_primitive(memory, destination, value) {
  if (typeof value === "string") write_string(memory, destination, value)
  else if (typeof value === "number") write_number(memory, destination, value)
  else if (typeof value === "boolean") write_boolean(memory, destination, value)
  else if (value === undefined) write_undefined(memory, destination)
  else throw new TypeError("Unsupported primitive result")
}

export function binary_operation(memory, destination, left, right, operator) {
  if (
    ["===", "!==", "==", "!="].includes(operator) &&
    (kind_of(memory, left) > KINDS.STRING ||
      kind_of(memory, right) > KINDS.STRING)
  ) {
    if (operator === "==" || operator === "!=")
      throw new TypeError("Loose object equality is not implemented yet")
    const equal =
      tag_of(memory, left) === TAGS.REF &&
      tag_of(memory, right) === TAGS.REF &&
      get_ref(memory, left) === get_ref(memory, right)
    write_boolean(memory, destination, operator === "===" ? equal : !equal)
    return
  }
  const a = primitive(memory, left),
    b = primitive(memory, right)
  let result
  switch (operator) {
    case "+":
      result = a + b
      break
    case "-":
      result = a - b
      break
    case "*":
      result = a * b
      break
    case "/":
      result = a / b
      break
    case "%":
      result = a % b
      break
    case "**":
      result = a ** b
      break
    case "===":
      result = a === b
      break
    case "!==":
      result = a !== b
      break
    case "==":
      result = a == b
      break
    case "!=":
      result = a != b
      break
    case "<":
      result = a < b
      break
    case "<=":
      result = a <= b
      break
    case ">":
      result = a > b
      break
    case ">=":
      result = a >= b
      break
    case "&":
      result = a & b
      break
    case "|":
      result = a | b
      break
    case "^":
      result = a ^ b
      break
    case "<<":
      result = a << b
      break
    case ">>":
      result = a >> b
      break
    case ">>>":
      result = a >>> b
      break
    default:
      throw new SyntaxError(`Unsupported binary operator: ${operator}`)
  }
  write_primitive(memory, destination, result)
}

export function unary_operation(memory, destination, source, operator) {
  if (operator === "!") {
    write_boolean(memory, destination, !truthy(memory, source))
    return
  }
  if (operator === "void") {
    write_undefined(memory, destination)
    return
  }
  if (operator === "typeof") {
    const tag = tag_of(memory, source)
    const kind = kind_of(memory, source)
    const result =
      tag === TAGS.UNDEFINED
        ? "undefined"
        : tag === TAGS.NUMBER
          ? "number"
          : tag === TAGS.BOOLEAN
            ? "boolean"
            : kind === KINDS.STRING
              ? "string"
              : kind === KINDS.FUNCTION
                ? "function"
                : "object"
    write_string(memory, destination, result)
    return
  }
  const value = primitive(memory, source)
  if (operator === "+") write_number(memory, destination, +value)
  else if (operator === "-") write_number(memory, destination, -value)
  else if (operator === "~") write_number(memory, destination, ~value)
  else throw new SyntaxError(`Unsupported unary operator: ${operator}`)
}
