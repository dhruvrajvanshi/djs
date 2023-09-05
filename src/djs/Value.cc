#include <djs/Value.hpp>

namespace djs {

auto Value::undefined() -> Value { return {Type::Undefined, {.undefined = 0}}; }

auto Value::is_undefined() const -> bool { return type == Type::Undefined; }

auto Value::null() -> Value { return {Type::Null, {.null = 0}}; }

auto Value::is_null() const -> bool { return type == Type::Null; }

}; // namespace djs
