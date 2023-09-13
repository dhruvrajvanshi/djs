#pragma once

#include "./Assertions.hpp"
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
  Boolean,
};
using NativeFunction = ValueCompletionRecord (*)(VM &, std::span<Value>);

struct Object;
struct Function;
struct String;

class Value {

private:
  using Type = ValueType;
  union As {
    // Void is not allowed here
    uint8_t undefined;
    uint8_t null;
    bool boolean;
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

  template <typename T> auto as_object() -> T * {
    ASSERT(type == Type::Object, "as_object called on non object value");
    auto *t = dynamic_cast<T *>(this->as.object);
    ASSERT(t != nullptr, typeid(T).name());
    return t;
  }

  static auto string(String *str) -> Value {
    return {Type::String, {.string = str}};
  }
  auto is_string() const -> bool { return type == Type::String; }
  auto as_string() const -> String * {
    ASSERT(type == Type::String, "as_string called on a non string type: {}");
    return as.string;
  }

  static auto boolean(bool b) -> Value {
    return {Type::Boolean, {.boolean = b}};
  }
  auto is_boolean() const -> bool { return type == Type::Boolean; }
  auto as_boolean() const -> bool {
    ASSERT(type == Type::Boolean, "as_boolean called on non boolean type");
    return as.boolean;
  }
};
static_assert(std::is_copy_assignable_v<Value>);
static_assert(std::is_copy_constructible_v<Value>);

} // namespace djs
