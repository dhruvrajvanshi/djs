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

export function create_arguments_object(memory, destination, arguments_) {
  create_object(memory, destination)
  const key = alloc_root(memory),
    length = alloc_root(memory)
  try {
    write_string(memory, key, "length")
    write_number(memory, length, arguments_.length)
    define_property(memory, destination, key, length, 5)
    for (let index = 0; index < arguments_.length; index++) {
      write_string(memory, key, String(index))
      define_property(memory, destination, key, arguments_[index])
    }
  } finally {
    free_root(memory, key)
    free_root(memory, length)
  }
}

export function create_function(
  memory,
  destination,
  code_id,
  function_id,
  environment,
  flags = 0,
  receiver,
) {
  const reference = allocate(memory, KINDS.FUNCTION, 48)
  set_ref(memory, destination, reference)
  write_u32(memory, reference + 8, code_id)
  write_u32(memory, reference + 12, function_id)
  write_u32(memory, reference + 32, flags)
  if (receiver !== undefined)
    copy_root_to_heap_value(memory, reference + 40, receiver)
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

// Object and function records have separate payloads but share property semantics.
function object_offsets(memory, object) {
  const kind = kind_of(memory, object)
  if (kind === KINDS.FUNCTION) return [24, 28]
  if (kind === KINDS.OBJECT || kind === KINDS.ERROR) return [8, 12]
  throw new TypeError("Expected an object")
}

export function find_property(
  memory,
  object,
  name,
  own = false,
  private_key = false,
) {
  const [head, prototype] = object_offsets(memory, object)
  let reference = get_ref(memory, object)
  let property_head = head,
    prototype_offset = prototype
  const key = alloc_root(memory)
  try {
    while (reference !== 0) {
      let property = read_u32(memory, reference + property_head)
      while (property !== 0) {
        const flags = read_u32(memory, property + 12)
        if (Boolean(flags & 8) === private_key) {
          copy_heap_value_to_root(memory, key, property + 16)
          if (
            private_key
              ? get_ref(memory, key) === get_ref(memory, name)
              : read_string(memory, key) === name
          )
            return property
        }
        property = read_u32(memory, property + 8)
      }
      if (own || private_key) break
      reference = read_u32(memory, reference + prototype_offset)
      if (reference !== 0) {
        const kind = read_u32(memory, reference)
        property_head = kind === KINDS.FUNCTION ? 24 : 8
        prototype_offset = kind === KINDS.FUNCTION ? 28 : 12
      }
    }
    return 0
  } finally {
    free_root(memory, key)
  }
}

export function get_property(memory, destination, object, key) {
  const name = to_string(memory, key)
  if (kind_of(memory, object) === KINDS.STRING) {
    if (name === "length")
      write_number(
        memory,
        destination,
        read_u32(memory, get_ref(memory, object) + 8),
      )
    else write_undefined(memory, destination)
    return 0
  }
  const property = find_property(memory, object, name)
  if (property === 0) write_undefined(memory, destination)
  else copy_heap_value_to_root(memory, destination, property + 24)
  // The interpreter invokes getters; the memory layer never executes guest code.
  return property !== 0 && read_u32(memory, property + 12) & 16 ? 1 : 0
}

export function define_property(memory, object, key, value, flags = 7, setter) {
  const [head] = object_offsets(memory, object)
  const private_key = Boolean(flags & 8)
  const property = find_property(
    memory,
    object,
    private_key ? key : to_string(memory, key),
    true,
    private_key,
  )
  if (property !== 0) {
    const previous_flags = read_u32(memory, property + 12)
    if (!(previous_flags & 4)) throw new TypeError("Cannot redefine property")
    if (flags & 16) {
      if (!(previous_flags & 16)) {
        write_u32(memory, property + 12, flags)
        const empty = alloc_root(memory)
        try {
          copy_root_to_heap_value(memory, property + 24, empty)
          copy_root_to_heap_value(memory, property + 32, empty)
        } finally {
          free_root(memory, empty)
        }
      }
      copy_root_to_heap_value(
        memory,
        property + (setter === undefined ? 24 : 32),
        value,
      )
      return
    }
    write_u32(memory, property + 12, flags)
    copy_root_to_heap_value(memory, property + 24, value)
    if (previous_flags & 16) {
      const empty = alloc_root(memory)
      try {
        copy_root_to_heap_value(memory, property + 32, empty)
      } finally {
        free_root(memory, empty)
      }
    }
    return
  }
  const normalized = alloc_root(memory)
  try {
    if (private_key || kind_of(memory, key) === KINDS.STRING)
      copy_value(memory, normalized, key)
    else write_string(memory, normalized, to_string(memory, key))
    const reference = allocate(memory, KINDS.PROPERTY, private_key ? 24 : 32)
    const object_reference = get_ref(memory, object)
    write_u32(memory, reference + 8, read_u32(memory, object_reference + head))
    write_u32(memory, reference + 12, flags)
    copy_root_to_heap_value(memory, reference + 16, normalized)
    copy_root_to_heap_value(
      memory,
      reference + (flags & 16 && setter !== undefined ? 32 : 24),
      value,
    )
    write_u32(memory, object_reference + head, reference)
  } finally {
    free_root(memory, normalized)
  }
}

export function set_property(memory, object, key, value) {
  const property = find_property(memory, object, to_string(memory, key))
  if (property !== 0) {
    const flags = read_u32(memory, property + 12)
    if (flags & 16) return property
    if (!(flags & 1)) throw new TypeError("Cannot assign to readonly property")
    if (find_property(memory, object, to_string(memory, key), true) !== 0) {
      copy_root_to_heap_value(memory, property + 24, value)
      return 0
    }
  }
  define_property(memory, object, key, value)
  return 0
}

export function private_property(
  memory,
  destination,
  object,
  key,
  value,
  initialize = false,
  has = false,
  readonly = false,
) {
  if (
    has &&
    ![KINDS.OBJECT, KINDS.FUNCTION, KINDS.ERROR].includes(
      kind_of(memory, object),
    )
  )
    throw new TypeError("Private brand check requires an object")
  const property = find_property(memory, object, key, true, true)
  if (has) {
    write_boolean(memory, destination, property !== 0)
    return
  }
  if (initialize) {
    if (property !== 0)
      throw new TypeError("Private field is already initialized")
    define_property(memory, object, key, value, readonly ? 8 : 9)
  } else {
    if (property === 0) throw new TypeError("Invalid private field receiver")
    if (value === undefined)
      copy_heap_value_to_root(memory, destination, property + 24)
    else {
      if (!(read_u32(memory, property + 12) & 1))
        throw new TypeError("Private method is readonly")
      copy_root_to_heap_value(memory, property + 24, value)
    }
  }
}

export function set_prototype(memory, object, prototype) {
  const [, offset] = object_offsets(memory, object)
  write_u32(
    memory,
    get_ref(memory, object) + offset,
    get_ref(memory, prototype),
  )
}

export function create_value_array(memory, destination, values) {
  const reference = allocate(memory, KINDS.VALUE_ARRAY, 8 + values.length * 8)
  set_ref(memory, destination, reference)
  write_u32(memory, reference + 8, values.length)
  for (let i = 0; i < values.length; i++)
    copy_root_to_heap_value(memory, reference + 16 + i * 8, values[i])
}

export function create_error(runtime, destination, name, message) {
  const { memory } = runtime
  create_object(memory, destination)
  write_u32(memory, get_ref(memory, destination), KINDS.ERROR)
  const prototype = runtime.error_prototypes?.get(name)
  if (prototype !== undefined) set_prototype(memory, destination, prototype)
  const key = alloc_root(memory),
    value = alloc_root(memory)
  try {
    write_string(memory, key, "name")
    write_string(memory, value, name)
    define_property(memory, destination, key, value, 5)
    write_string(memory, key, "message")
    write_string(memory, value, message)
    define_property(memory, destination, key, value, 5)
  } finally {
    free_root(memory, key)
    free_root(memory, value)
  }
}

function has_error_prototype(memory, value) {
  let reference = get_ref(memory, value)
  while (reference !== 0) {
    if (read_u32(memory, reference) === KINDS.ERROR) return true
    reference = read_u32(memory, reference + 12)
  }
  return false
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
        case KINDS.OBJECT:
          if (!has_error_prototype(memory, value)) return "[object Object]"
        case KINDS.ERROR: {
          const key = alloc_root(memory),
            text = alloc_root(memory)
          try {
            write_string(memory, key, "name")
            get_property(memory, text, value, key)
            const name = to_string(memory, text)
            write_string(memory, key, "message")
            get_property(memory, text, value, key)
            return name + ": " + to_string(memory, text)
          } finally {
            free_root(memory, key)
            free_root(memory, text)
          }
        }
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
  if (operator === "instanceof") {
    if (kind_of(memory, right) !== KINDS.FUNCTION)
      throw new TypeError("Expected a constructor")
    const key = alloc_root(memory),
      prototype = alloc_root(memory)
    try {
      write_string(memory, key, "prototype")
      get_property(memory, prototype, right, key)
      object_offsets(memory, prototype)
      let found = false
      if (
        [KINDS.OBJECT, KINDS.FUNCTION, KINDS.ERROR].includes(
          kind_of(memory, left),
        )
      ) {
        let reference = get_ref(memory, left)
        while (reference !== 0) {
          reference = read_u32(
            memory,
            reference +
              (read_u32(memory, reference) === KINDS.FUNCTION ? 28 : 12),
          )
          if (reference === get_ref(memory, prototype)) {
            found = true
            break
          }
        }
      }
      write_boolean(memory, destination, found)
      return
    } finally {
      free_root(memory, key)
      free_root(memory, prototype)
    }
  }
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
