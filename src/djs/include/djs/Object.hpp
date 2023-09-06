#include "./CompletionRecord.hpp"
#include "./GCBase.hpp"
#include "./OrdinaryObject.hpp"
#include "./PropertyDescriptor.hpp"
#include "./PropertyKey.hpp"
#include "./Value.hpp"

namespace djs {

class VM;

using GetPrototypeOfType = decltype(OrdinaryGetPrototypeOf) *;
using GetOwnPropertyType = decltype(OrdinaryGetOwnProperty) *;

struct Object : public GCBase {
  struct Slots {
    Value Prototype;
    bool Extensible;
    GetPrototypeOfType GetPrototypeOf;
    GetOwnPropertyType GetOwnProperty;

    static auto ordinary() -> Slots;
  };

  Slots slots;
  HashMap<PropertyKey, PropertyDescriptor> properties;

  explicit Object(Slots slots) : slots(slots), properties{} {}

  ~Object() {}
};

namespace abstract_ops {}
} // namespace djs
