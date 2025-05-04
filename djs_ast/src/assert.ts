import { AssertionError } from "node:assert/strict"
export function todo(message: () => string = () => "Unimplemented"): never {
  throw new AssertionError({
    message: `TODO: ${message()}`,
    stackStartFn: todo,
  })
}
