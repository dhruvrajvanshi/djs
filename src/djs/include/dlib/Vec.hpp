#pragma once
#include "./Traits.hpp"
#include <vector>

namespace djs {

template <CopyableOrMovable T> using Vec = std::vector<T>;

} // namespace djs

namespace std {

template <djs::HasToString T>
auto to_string(const djs::Vec<T> &v) -> std::string {
  auto result = "{"s;
  auto first = true;
  for (const auto &item : v) {
    if (first) {
      result += to_string(item);
      first = false;
    } else {
      result += ", " + to_string(item);
    }
  }
  return result + "}";
}

} // namespace std
