import { Span } from "./Span.js";
import { TokenKind } from "./TokenKind.js";

export interface Token {
  readonly kind: TokenKind;
  readonly span: Span;
  readonly line: number;
}
