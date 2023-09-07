#include "./Common.hpp"
#include "./Object.hpp"
#include "./Value.hpp"

namespace djs {

struct Array : public Object {
  Vec<Value> values;

  Array(Slots slots) : Object(std::move(slots)){};
};

} // namespace djs
