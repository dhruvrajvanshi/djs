// Every heap object starts with an eight-byte header: type, then total size.
// Fields are little-endian. "Value" fields hold an eight-byte boxed value;
// "ref" fields hold a raw u32 heap reference (0 for none).
export const HEADER = Object.freeze({ TYPE: 0, SIZE: 4, BYTES: 8 })

export const HEAP_TYPES = Object.freeze({
  STRING: 1,
  OBJECT: 2,
  PROPERTY: 3,
  FUNCTION: 4,
  ENVIRONMENT: 5,
  BYTE_BUFFER: 6,
  VALUE_ARRAY: 7,
  ERROR: 8,
  ARRAY: 9,
  STRING_OBJECT: 10,
  SYMBOL: 13,
  SUSPENDED_FRAME: 14,
})
export type HeapType = (typeof HEAP_TYPES)[keyof typeof HEAP_TYPES]

// Every object-like heap type (objects, errors, arrays, String objects and
// functions) starts with these two refs, so property code ignores the type.
export const OBJECT = Object.freeze({ PROPERTIES: 8, PROTOTYPE: 12 })
export const STRING_OBJECT = Object.freeze({ ...OBJECT, VALUE: 16 })
export const FUNCTION = Object.freeze({
  ...OBJECT,
  CODE: 16,
  ID: 20,
  FLAGS: 24,
  /** Ref to the steps of a built-in function. */
  STEPS: 28,
  ENVIRONMENT: 32,
  RECEIVER: 40,
  NEW_TARGET: 48,
})
// Private-key properties are allocated without the SETTER field.
export const PROPERTY = Object.freeze({
  NEXT: 8,
  FLAGS: 12,
  KEY: 16,
  VALUE: 24,
  SETTER: 32,
})
/**
 * Property attribute bits, stored in PROPERTY.FLAGS and carried by
 * DEFINE_PROP. An ACCESSOR property holds a getter and setter instead of a
 * value, and is never WRITABLE.
 */
export const PROPERTY_FLAGS = Object.freeze({
  WRITABLE: 1,
  ENUMERABLE: 2,
  CONFIGURABLE: 4,
  PRIVATE: 8,
  ACCESSOR: 16,
})
export type PropertyFlags = number

export const STRING = Object.freeze({ LENGTH: 8, UNITS: 12 })
export const SYMBOL = Object.freeze({ DESCRIPTION: 8 })
export const ENVIRONMENT = Object.freeze({
  PARENT: 8,
  COUNT: 16,
  SCOPE: 20,
  VALUES: 24,
})
export const VALUE_ARRAY = Object.freeze({ LENGTH: 8, VALUES: 16 })
export const BYTE_BUFFER = Object.freeze({ LENGTH: 8, BYTES: 12 })
/**
 * A frame detached from the call stack at `await`. COUNT values follow: the
 * frame's values from FRAME.ENVIRONMENT on, registers included.
 */
export const SUSPENDED_FRAME = Object.freeze({
  COUNT: 8,
  PC: 12,
  CODE: 16,
  FUNCTION: 20,
  FLAGS: 24,
  /** Nonzero once a resume function has put the frame back on the stack. */
  RESUMED: 28,
  VALUES: 32,
})

export interface Layout {
  min_payload_bytes: number
  refs: readonly number[]
  /** Optional trailing value fields are traced only when the heap object has room. */
  values: readonly number[]
  /** A run of values starting at `start` whose count is the u32 at `count`. */
  value_run?: { count: number; start: number }
}

const OBJECT_LAYOUT: Layout = {
  min_payload_bytes: 8,
  refs: [OBJECT.PROPERTIES, OBJECT.PROTOTYPE],
  values: [],
}

export const LAYOUTS: Readonly<Record<HeapType, Layout>> = Object.freeze({
  [HEAP_TYPES.STRING]: { min_payload_bytes: 4, refs: [], values: [] },
  [HEAP_TYPES.SYMBOL]: {
    min_payload_bytes: 8,
    refs: [],
    values: [SYMBOL.DESCRIPTION],
  },
  [HEAP_TYPES.OBJECT]: OBJECT_LAYOUT,
  [HEAP_TYPES.ERROR]: OBJECT_LAYOUT,
  [HEAP_TYPES.ARRAY]: OBJECT_LAYOUT,
  [HEAP_TYPES.STRING_OBJECT]: {
    min_payload_bytes: 16,
    refs: OBJECT_LAYOUT.refs,
    values: [STRING_OBJECT.VALUE],
  },
  [HEAP_TYPES.FUNCTION]: {
    min_payload_bytes: 48,
    refs: [...OBJECT_LAYOUT.refs, FUNCTION.STEPS],
    values: [FUNCTION.ENVIRONMENT, FUNCTION.RECEIVER, FUNCTION.NEW_TARGET],
  },
  [HEAP_TYPES.PROPERTY]: {
    min_payload_bytes: 24,
    refs: [PROPERTY.NEXT],
    values: [PROPERTY.KEY, PROPERTY.VALUE, PROPERTY.SETTER],
  },
  [HEAP_TYPES.ENVIRONMENT]: {
    min_payload_bytes: 16,
    refs: [],
    values: [ENVIRONMENT.PARENT],
    value_run: { count: ENVIRONMENT.COUNT, start: ENVIRONMENT.VALUES },
  },
  [HEAP_TYPES.VALUE_ARRAY]: {
    min_payload_bytes: 8,
    refs: [],
    values: [],
    value_run: { count: VALUE_ARRAY.LENGTH, start: VALUE_ARRAY.VALUES },
  },
  [HEAP_TYPES.BYTE_BUFFER]: { min_payload_bytes: 4, refs: [], values: [] },
  [HEAP_TYPES.SUSPENDED_FRAME]: {
    min_payload_bytes: 24,
    refs: [],
    values: [],
    value_run: { count: SUSPENDED_FRAME.COUNT, start: SUSPENDED_FRAME.VALUES },
  },
})

export function is_object_type(type: number) {
  return (
    type === HEAP_TYPES.OBJECT ||
    type === HEAP_TYPES.ERROR ||
    type === HEAP_TYPES.ARRAY ||
    type === HEAP_TYPES.STRING_OBJECT ||
    type === HEAP_TYPES.FUNCTION
  )
}
