#pragma once
#include "./Forward.hpp"
#include <optional>

namespace djs {
struct CompletionRecord {
  enum class Kind { Normal, Return, Throw, Break, Continue };
  const Kind kind;
  const std::optional<Value> value;

  static auto normal(Value value) -> CompletionRecord {
    return {Kind::Normal, value};
  }
};
} // namespace djs
