#pragma once
#include "./Printable.hpp"
#include <memory>

namespace djs {

template <typename T> using Box = std::unique_ptr<T>;

template <typename T, typename... Args> auto make_box(Args &&...args) {
  return std::make_unique<T>(std::forward<Args>(args)...);
}

template <Printable T>
std::ostream &operator<<(std::ostream &os, const Box<T> &t) {
  os << *t;
  return os;
}
} // namespace djs
