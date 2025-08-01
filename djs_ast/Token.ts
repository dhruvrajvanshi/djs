import type { Span } from "./Span.ts"
import { TokenKind } from "./TokenKind.ts"

export type Token = {
  readonly kind: TokenKind
  readonly span: Span
  readonly line: number
  readonly text: string
  readonly leading_trivia: string
}

export const Token = {
  can_start_object_property_name: (self: Token): boolean => {
    return (
      Token.is_valid_property_name(self) ||
      self.kind === TokenKind.LSquare ||
      self.kind === TokenKind.String
    )
  },
  is_valid_property_name: (self: Token): boolean => {
    return self.kind === TokenKind.Ident || TokenKind.is_keyword(self.kind)
  },
}
