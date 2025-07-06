export * from "./ansi.ts"
import { AssertionError } from "node:assert/strict"

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & unknown

/**
 * Takes a type T1 | T2, ... | Tn and returns
 * Readonly<T1> | Readonly<T2> | ... | Readonly<Tn>
 */
export type ReadonlyUnion<T extends Record<string, unknown>> = T extends unknown
  ? Prettify<Readonly<T>>
  : never

export function todo(template: TemplateStringsArray, ...args: unknown[]): never
export function todo(): never
export function todo(message: string): never
export function todo(
  first?: string | TemplateStringsArray,
  ...args: unknown[]
): never {
  let message: string
  if (first === undefined) {
    message = "TODO"
  } else if (typeof first === "string") {
    message = `TODO(${first})`
  } else {
    message = "TODO: "

    for (let i = 0; i < first.length; i++) {
      message += first[i]
      const arg = args[i]
      if (arg !== undefined) {
        message += JSON.stringify(arg)
      }
    }
  }
  throw new AssertionError({
    message: message,
    stackStartFn: todo,
  })
}

export function assert_todo(
  condition: unknown,
  message: string | null = null,
): asserts condition {
  if (!condition) {
    throw new AssertionError({
      message: message ? `TODO(${message})` : "TODO",
      stackStartFn: assert_todo,
    })
  }
}

export const MapUtils = {
  map_entries<K, V, K2, V2>(
    map: Map<K, V>,
    fn: (entry: [K, V]) => [K2, V2],
  ): Map<K2, V2> {
    const result = new Map<K2, V2>()
    for (const entry of map.entries()) {
      const [k, v] = fn(entry)
      result.set(k, v)
    }
    return result
  },
  map_values<K, V, V2>(map: Map<K, V>, fn: (value: V) => V2): Map<K, V2> {
    const result = new Map<K, V2>()
    for (const [k, v] of map.entries()) {
      result.set(k, fn(v))
    }
    return result
  },
}
