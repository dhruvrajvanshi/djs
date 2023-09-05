#pragma once

#define NOCOPY(T)                                                              \
  T(const T &) = delete;                                                       \
  T &operator=(T) = delete;
