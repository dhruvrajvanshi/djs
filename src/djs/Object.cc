#include "djs/Object.hpp"
#include "djs/CompletionRecord.hpp"

namespace djs {

auto Object::Slots::ordinary() -> Slots {
  return {.Prototype = Value::null(),
          .Extensible = true,
          .GetPrototypeOf = OrdinaryGetPrototypeOf,
          .GetOwnProperty = OrdinaryGetOwnProperty};
}

} // namespace djs
