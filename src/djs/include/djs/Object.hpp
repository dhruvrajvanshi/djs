#include "./CompletionRecord.hpp"
#include "./GCBase.hpp"
#include "./Value.hpp"

namespace djs {

struct Object : public GCBase {
  struct Slots {
    Value prototype;
    bool extensible;
  };

  Slots slots;
  Object(Slots slots) : slots(slots) {}

  ~Object() {}
};
} // namespace djs
