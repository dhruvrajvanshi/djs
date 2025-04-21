import { AssertionError } from 'node:assert'

export function assert_never(x: never): never {
  throw new AssertionError({
    message: `Unreachable object: ${x}`,
    stackStartFn: assert_never,
    expected: 'unreachable',
    actual: x,
  })
}

export function assert(
  condition: unknown,
  message: () => string = () => '',
  caller: (...args: never[]) => unknown = assert,
): asserts condition {
  if (!condition) {
    throw new AssertionError({
      message: message(),
      stackStartFn: caller,
    })
  }
}

export function todo(message: () => string = () => 'Unimplemented'): never {
  throw new AssertionError({
    message: `TODO: ${message()}`,
    stackStartFn: todo,
  })
}

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type ro<T> = Prettify<Readonly<T>>
export function objMapEntries<
  K extends PropertyKey,
  V,
  K1 extends PropertyKey,
  V1,
>(
  obj: Record<K, V>,
  fn: (entry: readonly [K, V]) => readonly [K1, V1],
): Record<K1, V1> {
  return Object.fromEntries<V1>(
    Object.entries<V>(obj).map(fn as never),
  ) as never
}

export function is_defined<T>(x: T | undefined | null): x is T {
  return x !== undefined && x !== null
}

export type StringUnionDiff<T, U> = T extends U ? never : T

export function obj_key_by<V, K extends PropertyKey>(
  items: readonly V[],
  keyOf: (value: V) => K,
): Record<K, V> {
  const result = {} as Record<K, V>
  for (const value of items) {
    const key = keyOf(value)
    if (key in result) {
      throw new Error(`Duplicate key found: ${key.toString()}`)
    }
    result[key] = value
  }
  return result
}

export function obj_from_entries<V, K extends PropertyKey>(
  entries: readonly [K, V][],
): Record<K, V> {
  return Object.fromEntries<V>(entries) as Record<K, V>
}
export function obj_map<V, U, K extends PropertyKey>(
  obj: Record<K, V>,
  func: (value: V, key: K) => U,
): Record<K, U> {
  const result = {} as Record<K, U>
  for (const key in obj) {
    result[key] = func(obj[key], key)
  }
  return result
}
