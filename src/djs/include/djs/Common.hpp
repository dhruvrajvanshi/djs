#pragma once
#include <iostream>

#define NOCOPY(T)                                                              \
  T(const T &) = delete;                                                       \
  T &operator=(T) = delete;

#define DEFAULT_CONSTRUCTORS(Value)                                            \
  Value(const Value &v) = default;                                             \
  Value &operator=(const Value &) = default;                                   \
  Value(const Value &&v) = default;                                            \
  Value &operator=(const Value &&v) = default;                                 \
  ~Value() = default;

namespace djs {

template <typename T>
concept Printable = requires(T t, std::ostream s) {
  { (s << t) };
};

template <typename T, Printable M> auto panic(M s) -> T {
  std::cerr << "PANIC: " << s << std::endl;
  std::abort();
}

template <typename T, Printable M> auto assert(bool condition, M message) -> T {
  if (!condition) {
    return panic<T>(message);
  }
}
} // namespace djs
