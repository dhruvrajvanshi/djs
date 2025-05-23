#include <gc.h>
#include "./djs_prelude.h"
#include "./djs_string.h"

#include <stdio.h>
#include <stdlib.h>

typedef struct DJSRuntime {
  size_t next_symbol;
} DJSRuntime;

DJSRuntime* djs_new_runtime(void) {
  GC_init();
  DJSRuntime* runtime = malloc(sizeof(DJSRuntime));
  runtime->next_symbol = 0;
  return runtime;
}

DJSSymbol djs_symbol_new(DJSRuntime* runtime) {
  size_t id = runtime->next_symbol;
  runtime->next_symbol++;
  DJSSymbol symbol = {id};
  return symbol;
}

void djs_free_runtime(DJSRuntime* runtime) {
  free(runtime);
}

bool IsStrictlyEqual(DJSValue left, DJSValue right) {
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
      return left.as.object == right.as.object;
    case DJS_TYPE_STRING:
      return djs_string_eq(left.as.string, right.as.string);
    default:
      DJS_PANIC("Unknown value type");
  }
}
bool djs_is_strictly_equal(DJSValue left, DJSValue right) {
  return IsStrictlyEqual(left, right);
}
