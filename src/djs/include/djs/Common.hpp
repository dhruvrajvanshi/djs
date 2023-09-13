#pragma once
#include "dlib/Opt.hpp"
#include "dlib/Printable.hpp"
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#define PANIC(s, ...)                                                          \
  do {                                                                         \
    std::cerr << "PANIC: " << __FILE__ << "(" << __LINE__                      \
              << "): " << s __VA_ARGS__ << std::endl;                          \
    std::abort();                                                              \
  } while (false);                                                             \
  std::unreachable();

#define ASSERT(condition, message)                                             \
  do {                                                                         \
    if (!(condition)) {                                                        \
      PANIC(message);                                                          \
    }                                                                          \
  } while (false);

#define TODO(name) PANIC("Unimplemented: ", name)

namespace djs {
template <typename T>
constexpr const bool IsCopyable =
    std::is_copy_constructible_v<T> && std::is_copy_assignable_v<T>;
template <typename T>
concept Copyable = IsCopyable<T>;

template <typename T>
constexpr const bool IsMovable =
    std::is_move_constructible_v<T> && std::is_move_assignable_v<T>;

template <typename T>
concept Movable = IsMovable<T>;

template <typename T>
concept CopyableOrMovable = IsMovable<T> || IsCopyable<T>;

template <CopyableOrMovable T> using Vec = std::vector<T>;

template <typename T>
concept Hashable = requires(T a) {
  { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
};

template <typename T, typename U>
concept EqComparable = requires(T t, U u) {
  { t == u } -> std::convertible_to<bool>;
};

template <typename K, typename V>
  requires Hashable<K> && EqComparable<K, K>
using HashMap = std::unordered_map<K, V>;

template <typename T>
concept StringLike = std::is_convertible_v<T, std::string_view>;

template <typename T>
using RValueOf = typename std::remove_reference<T>::type &&;

template <typename T>
concept HasToString = requires(const T &t) {
  { std::to_string(t) } -> std::convertible_to<std::string>;
};
} // namespace djs

namespace std {

template <djs::HasToString T>
auto to_string(const std::optional<T> &o) -> std::string {
  if (o.has_value()) {
    return to_string(*o);
  } else {
    return "null";
  }
}

template <djs::HasToString T>
auto to_string(const std::vector<T> &v) -> std::string {
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

template <djs::HasToString T>
auto to_string(const std::unique_ptr<T> &u) -> std::string {
  return std::to_string(*u);
}

} // namespace std
