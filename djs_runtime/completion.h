#pragma once

#include "./value.h"

#define DJS_COMPLETION_SET(var, expr) \
  {                                   \
    DJSCompletion completion = expr;  \
    if (completion.abrupt) {          \
      return completion;              \
    }                                 \
    var = completion.value;           \
  }

typedef struct DJSCompletion {
  DJSValue value;
  bool abrupt;
} DJSCompletion;

static inline DJSCompletion DJSCompletion_normal(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = false};
}

static inline DJSCompletion DJSCompletion_abrupt(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = true};
}
