#pragma once

#include "./Object.hpp"
#include "./Value.hpp"
#include "dlib/Vec.hpp"

namespace djs {

struct Array : public Object {
  Vec<Value> values{};

  Array() : Object(array_slots()){};

private:
  static auto array_slots() -> Slots { return Slots::ordinary(); }
};

} // namespace djs
