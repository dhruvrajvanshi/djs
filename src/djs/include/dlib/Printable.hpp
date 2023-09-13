#pragma once
#include <ostream>
#include <type_traits>

namespace djs {

template <typename T>
concept Printable = requires(const T &t, std::ostream &s) {
  { (s << t) } -> std::convertible_to<std::ostream &>;
};

} // namespace djs
