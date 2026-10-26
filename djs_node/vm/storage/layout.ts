// Every heap record starts with an eight-byte header: kind, then total size.
// Fields are little-endian. "Value" fields hold an eight-byte boxed value;
// "ref" fields hold a raw u32 heap reference (0 for none).
export const HEADER = Object.freeze({ KIND: 0, SIZE: 4, BYTES: 8 })

export const KINDS = Object.freeze({
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
})
export type Kind = (typeof KINDS)[keyof typeof KINDS]

// Every object-like record (objects, errors, arrays, String objects and
// functions) starts with these two refs, so property code ignores the kind.
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

export interface Layout {
  min_payload_bytes: number
  refs: readonly number[]
  /** Optional trailing value fields are traced only when the record has room. */
  values: readonly number[]
  /** A run of values starting at `start` whose count is the u32 at `count`. */
  value_run?: { count: number; start: number }
}

const OBJECT_LAYOUT: Layout = {
  min_payload_bytes: 8,
  refs: [OBJECT.PROPERTIES, OBJECT.PROTOTYPE],
  values: [],
}

export const LAYOUTS: Readonly<Record<number, Layout>> = Object.freeze({
  [KINDS.STRING]: { min_payload_bytes: 4, refs: [], values: [] },
  [KINDS.SYMBOL]: {
    min_payload_bytes: 8,
    refs: [],
    values: [SYMBOL.DESCRIPTION],
  },
  [KINDS.OBJECT]: OBJECT_LAYOUT,
  [KINDS.ERROR]: OBJECT_LAYOUT,
  [KINDS.ARRAY]: OBJECT_LAYOUT,
  [KINDS.STRING_OBJECT]: {
    min_payload_bytes: 16,
    refs: OBJECT_LAYOUT.refs,
    values: [STRING_OBJECT.VALUE],
  },
  [KINDS.FUNCTION]: {
    min_payload_bytes: 48,
    refs: [...OBJECT_LAYOUT.refs, FUNCTION.STEPS],
    values: [FUNCTION.ENVIRONMENT, FUNCTION.RECEIVER, FUNCTION.NEW_TARGET],
  },
  [KINDS.PROPERTY]: {
    min_payload_bytes: 24,
    refs: [PROPERTY.NEXT],
    values: [PROPERTY.KEY, PROPERTY.VALUE, PROPERTY.SETTER],
  },
  [KINDS.ENVIRONMENT]: {
    min_payload_bytes: 16,
    refs: [],
    values: [ENVIRONMENT.PARENT],
    value_run: { count: ENVIRONMENT.COUNT, start: ENVIRONMENT.VALUES },
  },
  [KINDS.VALUE_ARRAY]: {
    min_payload_bytes: 8,
    refs: [],
    values: [],
    value_run: { count: VALUE_ARRAY.LENGTH, start: VALUE_ARRAY.VALUES },
  },
  [KINDS.BYTE_BUFFER]: { min_payload_bytes: 4, refs: [], values: [] },
})

export function is_object_kind(kind: number) {
  return (
    kind === KINDS.OBJECT ||
    kind === KINDS.ERROR ||
    kind === KINDS.ARRAY ||
    kind === KINDS.STRING_OBJECT ||
    kind === KINDS.FUNCTION
  )
}
