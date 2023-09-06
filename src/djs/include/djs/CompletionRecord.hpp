#pragma once
#include "./Common.hpp"
#include "./Value.hpp"
#include <optional>

namespace djs {

template <typename T> struct CompletionRecord {
  enum class Kind { Normal, Return, Throw, Break, Continue };

  static auto normal(T value) -> CompletionRecord<T> {
    return {Kind::Normal, value};
  }

  static auto ret(T value) -> CompletionRecord<T> {
    return {Kind::Return, value};
  }

  auto value_or_panic() -> T {
    ASSERT(value.has_value(), "No value");
    return value.value();
  }

  auto kind() -> Kind { return _kind; }

private:
  const Kind _kind;
  const std::optional<T> value;

  CompletionRecord(const Kind &kind, const std::optional<T> &value)
      : _kind(kind), value(value) {
    switch (kind) {
    case Kind::Normal:
    case Kind::Throw:
    case Kind::Return:
      ASSERT(value.has_value(),
             "Normal/Throw/Return completions must contain a value");
      break;
    case Kind::Break:
    case Kind::Continue:
      break;
    }
  };
};

using ValueCompletionRecord = CompletionRecord<Value>;

} // namespace djs
