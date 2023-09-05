#pragma once
#include "./Common.hpp"
#include "./Value.hpp"
#include <optional>

namespace djs {

struct CompletionRecord {
  enum class Kind { Normal, Return, Throw, Break, Continue };

  static auto normal(Value value) -> CompletionRecord {
    return {Kind::Normal, value};
  }

  static auto ret(Value value) -> CompletionRecord {
    return {Kind::Return, value};
  }

  auto value_or_panic() -> Value {
    assert(value.has_value(), "No value");
    return value.value();
  }

  auto kind() -> Kind { return _kind; }

private:
  const Kind _kind;
  const std::optional<Value> value;

  CompletionRecord(const Kind &kind, const std::optional<Value> &value)
      : _kind(kind), value(value) {
    switch (kind) {
    case Kind::Normal:
    case Kind::Throw:
    case Kind::Return:
      assert(value.has_value(),
             "Normal/Throw/Return completions must contain a value");
      break;
    case Kind::Break:
    case Kind::Continue:
      break;
    }
  };
};

} // namespace djs
