#pragma once

#include "./Value.hpp"

namespace djs {

struct PropertyDescriptor {
  Value Get;
  Value Set;
  Opt<Value> Value;
  bool Writable;
};

} // namespace djs
