export function assert_never(x: never): never {
  throw new Error(`Unexpected object: ${x}`)
}

export function assert(
  condition: unknown,
  message: () => string,
): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message()}`)
  }
}
