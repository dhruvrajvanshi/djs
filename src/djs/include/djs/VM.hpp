#pragma once
#include "./CompletionRecord.hpp"
#include "./Function.hpp"

namespace djs {
class VM {
public:
  auto execute(const Function &) -> CompletionRecord;
};

} // namespace djs
