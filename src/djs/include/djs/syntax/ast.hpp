#pragma once
#include "../Common.hpp"
#include <string>

namespace djs {
class ParseNode {};
struct Parameter {
  std::string name;
};
struct ParameterList {
  Vec<Parameter> names;
};

} // namespace djs
