import assert from "node:assert"

export type t<T> = T[]

export function take<T>(queue: t<T>): T {
  const entry = queue.shift() ?? null
  assert(entry !== null)
  return entry
}
export function push<T>(queue: t<T>, item: T): void {
  queue.push(item)
}
export function from<T>(items: Iterable<T>): t<T> {
  return Array.from(items)
}
