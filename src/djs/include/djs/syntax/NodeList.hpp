#pragma once
#include "./ParseNode.hpp"
#include <type_traits>

namespace djs {
template <typename T>
  requires(std::is_assignable_v<ParseNode, T>)
struct NodeList {
  Vec<T> items;

  template <typename U>
  friend std::ostream &operator<<(std::ostream &, const NodeList<U> &);
};

template <typename T>
std::ostream &operator<<(std::ostream &os, const NodeList<T> &l) {
  os << "{\n";
  for (const auto &item : l.items) {
    os << "  " << item << ",\n";
  }
  os << "}";
  return os;
}

} // namespace djs
