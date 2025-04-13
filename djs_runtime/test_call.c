#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "./djs.h"
#include "test_prelude.h"

DJSCompletion bool_not(DJSRuntime* runtime,
                       DJSValue UNUSED(this),
                       DJSValue* args,
                       size_t argc) {
  if (argc != 1) {
    return djs_completion_abrupt(
        djs_value_from(djs_string_new(runtime, "Expected 1 argument")));
  }
  DJSValue arg = args[0];
  if (!djs_is_bool(arg)) {
    return djs_completion_abrupt(
        djs_value_from(djs_string_new(runtime, "Expected a boolean")));
  }
  if (djs_is_bool(arg) && djs_value_as_bool(arg)) {
    return djs_completion_normal(djs_false());
  } else {
    return djs_completion_normal(djs_true());
  }
}

int main(void) {
  DJSRuntime* runtime = djs_new_runtime();

  DJSObject* func = (DJSObject*)djs_function_new(runtime, bool_not);
  DJSValue t = djs_true();
  DJSValue f = djs_false();
  ASSERT_NORMAL(djs_call(runtime, func, djs_undefined(), &t, 1), djs_false());

  ASSERT_NORMAL(djs_call(runtime, func, djs_undefined(), &f, 1), djs_true());

  ASSERT_ABRUPT(djs_call(runtime, func, djs_undefined(), NULL, 0));

  djs_free_runtime(runtime);
}
