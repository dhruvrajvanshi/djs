declare const brand: unique symbol

export type Brand<T, Name extends string> = T & { readonly [brand]: Name }

export function record_invert<K extends PropertyKey, V extends PropertyKey>(
  map: Record<K, V>,
): Record<V, K> {
  const inverted: Record<V, K> = {} as Record<V, K>
  for (const key in map) {
    const value = map[key]
    inverted[value] = key
  }
  return inverted
}

export function panic(message: string): never {
  throw new Error(message)
}
