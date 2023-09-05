#include "./CompletionRecord.hpp"
#include "./Value.hpp"

namespace djs {

struct Object {
  Value prototype;
  bool extensible;
};
} // namespace djs
