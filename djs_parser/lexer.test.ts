import { test } from "node:test"
import assert from "node:assert"
import { Lexer } from "./lexer.ts"
import { TokenKind } from "djs_ast"

const cases: [string, TokenKind[]][] = [
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
  ["#!/usr/bin/env node", [TokenKind.EndOfFile]],
  ["#!/usr/bin/env node\n123", [TokenKind.Number, TokenKind.EndOfFile]],
  [" #!", [TokenKind.Error]],
]

for (const [input, kinds] of cases) {
  test("Lex test", () => {
    const lexer = Lexer(input)
    for (const expected_kind of kinds) {
      const token = lexer.next()
      assert.strictEqual(token.kind, expected_kind)
    }
  })
}
