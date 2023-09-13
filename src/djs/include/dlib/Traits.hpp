#pragma once

#include <concepts>
#include <string>
#include <string_view>
#include <type_traits>

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

template <typename T>
concept Hashable = requires(T a) {
  { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
};

template <typename T, typename U>
concept EqComparable = requires(T t, U u) {
  { t == u } -> std::convertible_to<bool>;
};

template <typename T>
concept StringLike = std::is_convertible_v<T, std::string_view>;

template <typename T>
concept HasToString = requires(const T &t) {
  { std::to_string(t) } -> std::convertible_to<std::string>;
};

} // namespace djs
