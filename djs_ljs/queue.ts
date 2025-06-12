export type t<T> = T[]

export function take<T>(queue: t<T>): T | null {
  return queue.shift() ?? null
}
export function push<T>(queue: t<T>, item: T): void {
  queue.push(item)
}
export function from<T>(items: Iterable<T>): t<T> {
  return Array.from(items)
}
