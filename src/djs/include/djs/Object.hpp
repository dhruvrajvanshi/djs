#include "./CompletionRecord.hpp"
#include "./GCBase.hpp"
#include "./Value.hpp"

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
  Object(Slots slots) : slots(slots) {}

  ~Object() {}
};

namespace abstract_ops {}
} // namespace djs
