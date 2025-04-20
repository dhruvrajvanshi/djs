import { AssertionError, fail } from 'node:assert'

export function assert_never(x: never): never {
  throw new AssertionError({
    message: `Unreachable object: ${x}`,
    stackStartFn: assert_never,
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
