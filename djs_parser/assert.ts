import { AssertionError } from "node:assert/strict"
export function todo(message: () => string = () => "Unimplemented"): never {
  throw new AssertionError({
    message: `TODO: ${message()}`,
    stackStartFn: todo,
  })
}
export function panic(message: string): never {
  throw new AssertionError({
    message,
    stackStartFn: panic,
  })
}

export function unreachable(
  message: string = "Unreachable code reached",
): never {
  throw new AssertionError({
    message,
    stackStartFn: unreachable,
  })
}
