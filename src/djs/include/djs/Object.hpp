#include "./CompletionRecord.hpp"
#include "./GCBase.hpp"
#include "./PropertyDescriptor.hpp"
#include "./Value.hpp"
#include <unordered_map>

namespace djs {

class VM;

using GetPrototypeOfType = CompletionRecord (*)(VM *, Object *);
struct Object : public GCBase {
  struct Slots {
    Value Prototype;
    bool Extensible;
    GetPrototypeOfType GetPrototypeOf;
  };
  static CompletionRecord OrdinaryGetPrototypeOf(VM *, Object *);

  Slots slots;
  std::unordered_map<std::string, PropertyDescriptor> properties;

  Object(Slots slots) : slots(slots) {}

  ~Object() {}
};

namespace abstract_ops {}
} // namespace djs
