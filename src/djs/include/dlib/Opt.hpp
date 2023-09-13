#pragma once

#include "./Printable.hpp"
#include <optional>

namespace djs {
template <typename T> using Opt = std::optional<T>;
} // namespace djs

template <djs::Printable T>
std::ostream &operator<<(std::ostream &os, const djs::Opt<T> &t) {
  if (t.has_value()) {
    const T &v = *t;
    os << v;
  } else {
    os << "null";
  }
  return os;
}
