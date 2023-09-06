#pragma once
#include <iostream>
#include <optional>
#include <unordered_map>
#include <vector>

template <typename T>
concept Printable = requires(T t, std::ostream s) {
  { (s << t) };
};

#define PANIC(s)                                                               \
  do {                                                                         \
    std::cerr << "PANIC: " << __FILE__ << ": " << s << std::endl;              \
    std::abort();                                                              \
  } while (false);

#define ASSERT(condition, message)                                             \
  do {                                                                         \
    if (!(condition)) {                                                        \
      PANIC(message);                                                          \
    }                                                                          \
  } while (false);

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

template <typename T> using Opt = std::optional<T>;

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

} // namespace djs
