#pragma once

#define DJS_COMPLETION_SET(var, expr) \
  {                                   \
    DJSCompletion completion = expr;  \
    if (completion.abrupt) {          \
      return completion;              \
    }                                 \
    var = completion.value;           \
  }
