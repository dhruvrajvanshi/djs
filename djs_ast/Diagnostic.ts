import type { Span } from "./Span.ts"

export interface Diagnostic {
  span: Span
  message: string
}
