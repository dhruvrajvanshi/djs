import { tokens } from "./src/tokens.def.js";

let output = "";

output += `
// This file is generated automatically
// node djs_ast/gen_tokens.js
// DO NOT EDIT\n
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum TokenKind {
`;
for (const token of tokens) {
  if (typeof token === "string") {
    output += `  ${token},\n`;
  } else {
    output += `  ${token[0]},\n`;
  }
}
output += "}\n";

const keywords = tokens
  .filter((token) => typeof token === "object")
  .map(([variant, text]) => ({ variant, text }));
output += `
  impl TokenKind {
    pub fn from_str(s: &str) -> Option<TokenKind> {
      match s {
        ${keywords
          .map(
            ({ text, variant }) =>
              `\"${text}\" => Some(TokenKind::${variant}),`,
          )
          .join("\n        ")}
        _ => None,
      }
    }

    pub fn is_keyword(&self) -> bool {
      match self {
        ${keywords
          .map(({ variant }) => `TokenKind::${variant} => true,`)
          .join("\n        ")}
        _ => false,
      }
    }
  }
`;

console.log(output);
