#pragma once
#include <iostream>
#include <optional>
#include <vector>

#define NOCOPY(T)                                                              \
  T(const T &) = delete;                                                       \
  T &operator=(const T &) = delete;

#define DEFAULT_COPY(Value)                                                    \
  Value(const Value &v) = default;                                             \
  Value &operator=(const Value &) = default;

#define DEFAULT_MOVE(Value)                                                    \
  Value &operator=(const Value &&v) = default;                                 \
  Value &operator=(const Value &&v) = default;

#define DEFAULT_DESTRUCTOR(Value) ~Value() = default;

template <typename T>
concept Printable = requires(T t, std::ostream s) {
  { (s << t) };
};

template <Printable M> [[noreturn]] auto PANIC(M s) -> void {
  std::cerr << "PANIC: " << s << std::endl;
  std::abort();
}

template <Printable M> auto ASSERT(bool condition, M message) -> void {
  if (!condition) {
    PANIC(message);
  }
}



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

} // namespace djs
