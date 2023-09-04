#include <djs/Value.hpp>

namespace djs {

auto Value::undefined() -> Value {
    return { Kind::Undefined, 0 };
}

auto Value::is_undefined() const -> bool {
    return kind == Kind::Undefined;
}

auto Value::null() -> Value {
    return { Kind::Null, 0 };
}

auto Value::is_null() const -> bool {
    return kind == Kind::Null;
}

};


