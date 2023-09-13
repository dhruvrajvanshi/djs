#pragma once
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

namespace djs {} // namespace djs
