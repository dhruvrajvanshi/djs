#pragma once

#include "./Common.hpp"
#include "./Forward.hpp"
#include <cstdint>
#include <functional>
#include <span>
#include <type_traits>

namespace djs {
enum class ValueType {
  Undefined,
  Null,
  NativeFunction,
};
using NativeFunction = CompletionRecord (*)(VM &, std::span<Value>);

class Value {

private:
  using Type = ValueType;
  Type type;
  union As {
    // Void is not allowed here
    uint8_t undefined;
    uint8_t null;
    NativeFunction native_function;
  } as;
  Value(Type type, As as) : type(type), as(as) {}

public:
  static auto undefined() -> Value;
  auto is_undefined() const -> bool;

  static auto null() -> Value;
  auto is_null() const -> bool;

  static auto native_function(NativeFunction f) -> Value {
    return Value{Type::NativeFunction, {.native_function = f}};
  }
};
static_assert(std::is_copy_assignable_v<Value>);
static_assert(std::is_copy_constructible_v<Value>);

} // namespace djs
