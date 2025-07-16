export * from "./ansi.ts"
import { AssertionError } from "node:assert/strict"
import { inspect } from "node:util"

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

export function* indicies<T>(
  array: readonly unknown[],
): IterableIterator<number> {
  for (let i = 0; i < array.length; i++) {
    yield i
  }
}
export function assert_never(value: never): never {
  throw new AssertionError({
    message: `Unreachable assertion reached`,
    actual: value,
    expected: "<unreachable>",
    stackStartFn: assert_never,
  })
}

export function todo(template: TemplateStringsArray, ...args: unknown[]): never
export function todo(): never
export function todo(message: string): never
export function todo(message: unknown): never
export function todo(first?: unknown, ...args: unknown[]): never {
  let message: string
  if (first === undefined) {
    message = "TODO"
  } else if (typeof first === "string") {
    message = `TODO(${first})`
  } else if (Array.isArray(first) && "raw" in first) {
    message = "TODO: "

    for (const i of indicies(first)) {
      message += first[i]
      const arg = args[i]
      if (arg !== undefined) {
        message += JSON.stringify(arg)
      }
    }
  } else {
    message = inspect(first)
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
  map_values<K, V, V2>(
    map: Map<K, V>,
    fn: (value: V, key: K) => V2,
  ): Map<K, V2> {
    const result = new Map<K, V2>()
    for (const [k, v] of map.entries()) {
      result.set(k, fn(v, k))
    }
    return result
  },
  get_or_set<K, V>(map: Map<K, V>, key: K, default_value: V): V {
    if (map.has(key)) {
      return map.get(key)!
    } else {
      map.set(key, default_value)
      return default_value
    }
  },
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    if (!keys.includes(key as K)) {
      result[key] = value[key]
    }
  }
  return result as Omit<T, K>
}

export function is_readonly_array(
  value: unknown,
): value is ReadonlyArray<unknown> {
  return Array.isArray(value)
}

export function rx(...parts: (string | RegExp)[]): RegExp {
  const pattern = parts
    .map((part) => (typeof part === "string" ? rx.escape(part) : part.source))
    .join("")

  try {
    return new RegExp(pattern)
  } catch (e) {
    const wrapped = new AssertionError({
      message: `Invalid regex: ${pattern}`,
      stackStartFn: rx,
    })
    wrapped.cause = e
    throw wrapped
  }
}
rx.named = function named(name: string, regex: RegExp): RegExp {
  if (regex.flags.includes("g")) {
    throw new Error("Cannot name a global regex")
  }
  return new RegExp(`(?<${name}>${regex.source})`, regex.flags)
}

rx.escape = function (str: string): string {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")
}

export type Predicate<T> = (value: T) => boolean
export type AnyFunc = (...args: never[]) => unknown

export function get_or_insert<K extends PropertyKey, V>(
  record: Record<K, V>,
  key: K,
  default_value: () => V,
): V
export function get_or_insert<K, V>(
  map: Map<K, V>,
  key: K,
  default_value: () => V,
): V
export function get_or_insert<K extends PropertyKey, V>(
  arg: Record<K, V> | Map<K, V>,
  key: K,
  default_value: () => V,
): V {
  if (arg instanceof Map) {
    return map_get_or_insert(arg, key, default_value)
  } else {
    return record_get_or_insert(arg, key, default_value)
  }
}

export function record_get_or_insert<K extends PropertyKey, V>(
  record: Record<K, V>,
  key: K,
  default_value: () => V,
): V {
  if (key in record) {
    return record[key]
  } else {
    const value = default_value()
    record[key] = value
    return value
  }
}

export function map_get_or_insert<K, V>(
  map: Map<K, V>,
  key: K,
  default_value: () => V,
): V {
  if (map.has(key)) {
    return map.get(key)!
  } else {
    const value = default_value()
    map.set(key, value)
    return value
  }
}
