#pragma once

#include <stdio.h>
#include <stdlib.h>
#include "djs.h"

#define ASSERT_EQEQEQ(left, right)                                           \
  if (!djs_is_strictly_equal(left, right)) {                                 \
    DJSValue left_value = left;                                              \
    DJSValue right_value = right;                                            \
    fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t%s == %s\n", \
            __FILE__, __LINE__, __func__, #left, #right);                    \
    fprintf(stderr, "Because:\n");                                           \
    fprintf(stderr, "\t");                                                   \
    djs_value_pretty_print(stderr, left_value);                              \
    fprintf(stderr, " != ");                                                 \
    djs_value_pretty_print(stderr, right_value);                             \
    fprintf(stderr, "\n");                                                   \
    exit(1);                                                                 \
  }

#define ASSERT_NORMAL(completion_expr, expected_expr)                          \
  {                                                                            \
    DJSCompletion completion = completion_expr;                                \
    DJSValue expected = expected_expr;                                         \
    if (completion.abrupt) {                                                   \
      fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t", __FILE__, \
              __LINE__, __func__);                                             \
      fprintf(stderr, "Expected %s to not throw an exception\n",               \
              #completion_expr);                                               \
      fprintf(stderr, "But the following exception was thrown:\n\t");          \
      djs_value_pretty_print(stderr, completion.value);                        \
      fprintf(stderr, "\n");                                                   \
      exit(1);                                                                 \
    }                                                                          \
    if (!djs_is_strictly_equal(completion.value, expected)) {                  \
      fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t", __FILE__, \
              __LINE__, __func__);                                             \
      fprintf(stderr, "%s !== %s:\n", #completion_expr, #expected_expr);       \
      fprintf(stderr, "Because:\n");                                           \
      fprintf(stderr, "\t");                                                   \
      djs_value_pretty_print(stderr, completion.value);                        \
      fprintf(stderr, " !== ");                                                \
      djs_value_pretty_print(stderr, expected);                                \
      fprintf(stderr, "\n");                                                   \
      exit(1);                                                                 \
    }                                                                          \
  }

#define ASSERT_ABRUPT(completion_expr)                                         \
  {                                                                            \
    DJSCompletion completion = completion_expr;                                \
    if (!completion.abrupt) {                                                  \
      fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t", __FILE__, \
              __LINE__, __func__);                                             \
      fprintf(stderr, "Expected %s to throw an exception\n",                   \
              #completion_expr);                                               \
      fprintf(stderr, "But it returned normally with value:\n\t");             \
      djs_value_pretty_print(stderr, completion.value);                        \
      fprintf(stderr, "\n");                                                   \
      exit(1);                                                                 \
    }                                                                          \
  }

static inline DJSValue value_id(DJSValue value) {
  return value;
}
