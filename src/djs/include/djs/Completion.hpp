#pragma once
#include "./Common.hpp"
#include "./Value.hpp"
#include <optional>

#define RETURN_IF_ABRUPT(c, t)                                                 \
  do {                                                                         \
    auto x = c;                                                                \
    if (x.is_abrupt()) {                                                       \
      return x.copy_abrupt_as<t>();                                            \
    }                                                                          \
  } while (false);

namespace djs {

enum class CompletionKind { Normal, Return, Throw, Break, Continue };
template <typename T> struct Completion {
  using Kind = CompletionKind;

  Completion(T value)
      : _kind(Kind::Normal), value(std::move(value)),
        abrupt_value(std::nullopt) {}

  Completion(Kind kind, Opt<T> value, Opt<Value> abrupt_value)
      : _kind(kind), value(value), abrupt_value(abrupt_value) {}
  static auto normal(T value) -> Completion<T> { return {Kind::Normal, value}; }

  static auto ret(T value) -> Completion<T> { return {Kind::Return, value}; }

  auto value_or_panic() -> T {
    ASSERT(value.has_value(), "No value");
    return value.value();
  }

  auto kind() -> Kind { return _kind; }

  auto is_abrupt() -> bool { return kind() != Kind::Normal; }

  /// @brief  Return a copy of  this abrupt completion record
  ///         as a CompletionRecord<U>. Panics if the record is not abrupt.
  template <typename U> auto copy_abrupt_as() -> Completion<U> {
    ASSERT(is_abrupt(), "copy_abrupt_as called on a normal completion");
    switch (_kind) {
    case Kind::Break:
    case Kind::Continue:
    case Kind::Return:
    case Kind::Throw: {
      return {_kind, std::nullopt, abrupt_value};
    }

    default:
      PANIC("Unreachable")
    }
  }

  auto operator*() -> T {
    ASSERT(kind() == Kind::Normal, "Tried to dereference an abrupt completion");
    return value_or_panic();
  }

private:
  Kind _kind;
  std::optional<T> value;
  std::optional<Value> abrupt_value;

  Completion(const Kind &kind, const std::optional<T> &value)
      : _kind(kind), value(value), abrupt_value(Opt<Value>{}) {
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

auto make_normal(auto t) -> Completion<decltype(t)> {
  return Completion<decltype(t)>(t);
}

using ValueCompletionRecord = Completion<Value>;

} // namespace djs
