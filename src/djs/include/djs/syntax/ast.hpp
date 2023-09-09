#pragma once
#include "./ParseNode.hpp"
#include "./ast.gen.hpp"
#include <string>

namespace djs {

struct Parameter : ParseNode {
  std::string name;
};
struct ParameterList : ParseNode {
  Vec<Parameter> names;
};

} // namespace djs
