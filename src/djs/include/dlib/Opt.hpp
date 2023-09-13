#pragma once

#include "./Printable.hpp"
#include "./Traits.hpp"
#include <optional>

namespace djs {
template <typename T> using Opt = std::optional<T>;

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

} // namespace djs

namespace std {

template <djs::HasToString T>
auto to_string(const djs::Opt<T> &o) -> std::string {
  if (o.has_value()) {
    return to_string(*o);
  } else {
    return "null";
  }
}

} // namespace std
