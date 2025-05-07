import { test, expect } from "vitest";
import { Lexer } from "./lexer";
import { TokenKind } from "./TokenKind";

test.each([
  ["", [TokenKind.EndOfFile]],
  [" ", [TokenKind.EndOfFile]],
  ["\n", [TokenKind.EndOfFile]],
  ["\t", [TokenKind.EndOfFile]],
  ["\r", [TokenKind.EndOfFile]],
  ["\r\n", [TokenKind.EndOfFile]],
  ["\n\r", [TokenKind.EndOfFile]],
  ["\r\n\r\n", [TokenKind.EndOfFile]],
  ["123", [TokenKind.Number, TokenKind.EndOfFile]],
  ["+=", [TokenKind.PlusEq, TokenKind.EndOfFile]],
])("Lex test", (input, kinds) => {
  const lexer = Lexer(input);
  for (const expected_kind of kinds) {
    const token = lexer.next();
    expect(token.kind).toBe(expected_kind);
  }
});
