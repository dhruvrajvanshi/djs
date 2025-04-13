#pragma once
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#ifdef __GNUC__
#define UNUSED(x) UNUSED_##x __attribute__((__unused__))
#else
#define UNUSED(x) UNUSED_##x
#endif

#ifdef __GNUC__
#define UNUSED_FUNCTION(x) __attribute__((__unused__)) UNUSED_##x
#else
#define UNUSED_FUNCTION(x) UNUSED_##x
#endif

#define MK_OPT(Name, T)                                           \
  typedef struct Name {                                           \
    bool is_present;                                              \
    T value;                                                      \
  } Name;                                                         \
  static inline Name __attribute__((unused)) Name##_of(T value) { \
    return (Name){.is_present = true, .value = value};            \
  }                                                               \
  static inline Name __attribute__((unused)) Name##_empty() {     \
    return (Name){.is_present = false};                           \
  }

#define DJS_PANIC(msg)                                                         \
  do {                                                                         \
    fprintf(stderr, "PANIC at %s:%d in function %s: %s\n", __FILE__, __LINE__, \
            __func__, msg);                                                    \
    exit(1);                                                                   \
  } while (0)
#define DJS_TODO()                                                        \
  do {                                                                    \
    fprintf(stderr, "TODO at %s:%d in function %s\n", __FILE__, __LINE__, \
            __func__);                                                    \
    exit(1);                                                              \
  } while (0)

#define NULLABLE _Nullable
#define NONNULL _Nonnull
