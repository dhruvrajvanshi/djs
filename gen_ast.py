exprs = {
    'Call': [
        ('std::unique_ptr<Expression>', 'callee'),
        ('Vec<Expression>', 'arguments')
    ],
    'Var': [('std::string', 'name'), ]
};

def to_string_impl():
    def args_cat(args):
        return ' + '.join([f'to_string(c.{name})' for (_, name) in args])
    cases = [
        f"""case {name}: {{
      auto& c = e.as<djs::{name}Expression>();
      return "{name}"s + "("s + {args_cat(args)} + ")";
    }}
"""
        for name, args in exprs.items()
    ]
    cases = '\n    '.join(cases)
    return f"""
namespace std {{
auto to_string(const djs::Expression& e) -> std::string {{
  switch (e.kind) {{
    using enum djs::Expression::Kind;
    {cases}
  }}
}}
}} // namespace std
"""


def main() -> None:
    expr_structs = '\n'.join([gen_expr_struct(e, a) for e, a in exprs.items()])

    kind_names = ',\n    '.join(exprs.keys())
    code = f"""
#pragma once
#include <string>
#include "../Common.hpp"
#include "./ParseNode.hpp"

namespace djs {{
struct Expression: public ParseNode {{
  enum Kind {{
    {kind_names}
  }};
  Kind kind;

  template <typename T>
    requires std::is_assignable_v<Expression, T>
  auto as() const -> const T& {{
    return dynamic_cast<const T&>(*this);
  }}
}};
{expr_structs}
}} // namespace djs
{to_string_impl()}
    """
    print(code)

def gen_expr_struct(e, args) -> str:
    args_fields = ';\n  '.join([
        f'{t} {name}'for t, name in args
    ])
    return f"""struct {e}Expression : public Expression {{
  {args_fields};
}};
"""

if __name__ == '__main__':
    main()
