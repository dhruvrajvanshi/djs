#pragma once

#include "./Value.hpp"
#include "dlib/Opt.hpp"

namespace djs {

struct PropertyDescriptor {
  Opt<Value> get = Value::undefined();
  Opt<Value> set = Value::undefined();
  Opt<Value> value = Value::undefined();
  bool enumerable = false;
  bool writable = false;
  bool confugrable = false;

  auto IsAccessorDescriptor() -> bool {
    return get.has_value() || set.has_value();
  }
  auto IsDataDescriptor() -> bool { return value.has_value() || writable; }
};

} // namespace djs
