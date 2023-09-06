#pragma once

#include "./Common.hpp"
#include "./String.hpp"
#include "./Value.hpp"

namespace djs {

struct PropertyKey {
  Value value;

  explicit PropertyKey(Value value) : value(value) {
    ASSERT(value.is_string(), "PropertyKey must be a string");
  }
};

} // namespace djs

template <> struct std::hash<djs::PropertyKey> {
  auto operator()(const djs::PropertyKey &key) const -> std::size_t {
    ASSERT(key.value.is_string(), "PropertyKey must be a string");
    return std::hash<string>()(key.value.as_string()->contents);
  }
};
