#include <djs/Value.hpp>

namespace djs {

auto Value::undefined() -> Value { return {Type::Undefined, 0}; }

auto Value::is_undefined() const -> bool { return type == Type::Undefined; }

auto Value::null() -> Value { return {Type::Null, 0}; }

auto Value::is_null() const -> bool { return type == Type::Null; }

}; // namespace djs
