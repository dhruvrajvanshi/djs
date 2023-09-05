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
  Object,
};
using NativeFunction = CompletionRecord (*)(VM &, std::span<Value>);

class Object;

class Value {

private:
  using Type = ValueType;
  Type type;
  union As {
    // Void is not allowed here
    uint8_t undefined;
    uint8_t null;
    NativeFunction native_function;
    Object *object;
  } as;
  Value(Type type, As as) : type(type), as(as) {}

public:
  static auto undefined() -> Value;
  auto is_undefined() const -> bool;

  static auto null() -> Value;
  auto is_null() const -> bool;

  static auto object(Object *obj) -> Value {
    return {Type::Object, {.object = obj}};
  }
  auto is_object() -> bool { return type == Type::Object; }

  static auto native_function(NativeFunction f) -> Value {
    return Value{Type::NativeFunction, {.native_function = f}};
  }

  auto as_object() -> Object * {
    assert(type == Type::Object, "as_object called on non object value");
    return as.object;
  }
};
static_assert(std::is_copy_assignable_v<Value>);
static_assert(std::is_copy_constructible_v<Value>);

} // namespace djs
