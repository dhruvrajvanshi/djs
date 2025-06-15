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

export function todo(message: string | null = null): never {
  throw new AssertionError({
    message: message ? `TODO(${message})` : "TODO",
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
