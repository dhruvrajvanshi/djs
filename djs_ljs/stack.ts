import { AssertionError } from "node:assert"

export type t<T> = T[]
export const empty = <T>(): t<T> => []

export function push<T>(stack: t<T>, item: T): void {
  stack.push(item)
}
export function pop<T>(stack: t<T>): T {
  if (stack.length === 0) {
    throw new AssertionError({ message: "Stack underflow", stackStartFn: pop })
  }
  return stack.pop() as T
}

export function peek<T>(stack: t<T>): T | null {
  return stack[stack.length - 1] ?? null
}
export function* iter<T>(stack: t<T>): Iterable<T> {
  for (let i = stack.length - 1; i >= 0; i--) {
    yield stack[i]
  }
}
