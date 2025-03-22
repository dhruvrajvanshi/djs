#include "./runtime.h"
#include <gc.h>
#include "./prelude.h"
#include "./print.h"
#include "object.h"
#include "value.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct DJSRuntime {
  void* _;
} DJSRuntime;

DJSRuntime* djs_new_runtime(void) {
  GC_init();
  DJSRuntime* runtime = malloc(sizeof(DJSRuntime));
  runtime->_ = NULL;
  return runtime;
}
void djs_free_runtime(DJSRuntime* runtime) {
  free(runtime);
}

void djs_console_log(__attribute__((unused)) DJSRuntime* runtime,
                     DJSValue value) {
  DJSValue_print(stdout, value);
  puts("");
}

bool DJS_IsStrictlyEqual(DJSValue left, DJSValue right) {
  if (left.type != right.type) {
    return false;
  }
  switch (left.type) {
    case DJS_TYPE_UNDEFINED:
      return true;
    case DJS_TYPE_NULL:
      return true;
    case DJS_TYPE_BOOLEAN:
      return left.as.boolean == right.as.boolean;
    case DJS_TYPE_NUMBER:
      return left.as.number == right.as.number;
    case DJS_TYPE_OBJECT:
      if (left.as.object == right.as.object) {
        return true;
      }
    case DJS_TYPE_STRING:
      return DJSString_eq(*left.as.string, *right.as.string);
    default:
      DJS_PANIC("Unknown value type");
  }
}
