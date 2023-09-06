#pragma once

#include "./Value.hpp"

namespace djs {

struct PropertyDescriptor {
  Value get;
  Value set;
  Opt<Value> value;
  bool writable;
};

} // namespace djs
