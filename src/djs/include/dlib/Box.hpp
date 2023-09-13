#pragma once
#include "./Printable.hpp"
#include "./Traits.hpp"
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

namespace std {

template <djs::HasToString T>
auto to_string(const djs::Box<T> &u) -> std::string {
  return std::to_string(*u);
}

} // namespace std
