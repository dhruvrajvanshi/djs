#include "djs/Object.hpp"
#include "djs/CompletionRecord.hpp"

namespace djs {

auto Object::OrdinaryGetPrototypeOf(VM *, Object *obj) -> CompletionRecord {
  return CompletionRecord::normal(obj->slots.prototype);
}

} // namespace djs
