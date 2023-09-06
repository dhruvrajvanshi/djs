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
  String,
};
using NativeFunction = CompletionRecord (*)(VM &, std::span<Value>);

struct Object;
struct String;

class Value {

private:
  using Type = ValueType;
  union As {
    // Void is not allowed here
    uint8_t undefined;
    uint8_t null;
    NativeFunction native_function;
    Object *object;
    String *string;
  } as;
  Type type;
  Value(Type type, As as) : as(as), type(type) {}

public:
  static auto undefined() -> Value;
  auto is_undefined() const -> bool;

  static auto null() -> Value;
  auto is_null() const -> bool;

  static auto object(Object *obj) -> Value {
    return {Type::Object, {.object = obj}};
  }
  auto is_object() const -> bool { return type == Type::Object; }

  static auto native_function(NativeFunction f) -> Value {
    return Value{Type::NativeFunction, {.native_function = f}};
  }

  auto as_object() -> Object * {
    ASSERT(type == Type::Object, "as_object called on non object value");
    return as.object;
  }

  static auto string(String *str) -> Value {
    return {Type::String, {.string = str}};
  }
  auto is_string() const -> bool { return type == Type::String; }
  auto as_string() const -> String * {
    ASSERT(type == Type::String, "as_string called on a non string type: {}");
    return as.string;
  }
};
static_assert(std::is_copy_assignable_v<Value>);
static_assert(std::is_copy_constructible_v<Value>);

} // namespace djs
