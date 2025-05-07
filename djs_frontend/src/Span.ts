export interface Span {
  readonly start: number
  readonly stop: number
}

export interface Spanned {
  readonly span: Span
}
export const Span = {
  between: (start: Spanned | Span, stop: Spanned | Span): Span => ({
    start: get_span(start).start,
    stop: get_span(stop).stop,
  }),
} as const

function get_span(span: Spanned | Span): Span {
  if ("start" in span) {
    return span
  }
  return span.span
}
