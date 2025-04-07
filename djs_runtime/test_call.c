#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "./function.h"
#include "./prelude.h"
#include "./runtime.h"
#include "./value.h"
#include "completion.h"
#include "object.h"
#include "test_prelude.h"
#include "value.h"

DJSCompletion bool_not(DJSRuntime* runtime,
                       DJSValue UNUSED(this),
                       DJSValue* args,
                       size_t argc) {
  if (argc != 1) {
    return DJSCompletion_abrupt(
        DJS_new_string_as_value(runtime, "Expected 1 argument"));
  }
  DJSValue arg = args[0];
  if (!DJSValue_is_bool(arg)) {
    return DJSCompletion_abrupt(
        DJS_new_string_as_value(runtime, "Expected a boolean"));
  }
  if (DJSValue_is_true(arg)) {
    return DJSCompletion_normal(DJSValue_bool(false));
  } else {
    return DJSCompletion_normal(DJSValue_bool(true));
  }
}

int main(void) {
  DJSRuntime* runtime = djs_new_runtime();

  DJSObject* func = (DJSObject*)DJSFunction_new(runtime, bool_not);
  DJSValue t = DJSValue_bool(true);
  DJSValue f = DJSValue_bool(false);
  ASSERT_NORMAL(DJSObject_Call(runtime, func, DJSValue_undefined(), &t, 1),
                DJSValue_bool(false));

  ASSERT_NORMAL(DJSObject_Call(runtime, func, DJSValue_undefined(), &f, 1),
                DJSValue_bool(true));

  ASSERT_ABRUPT(DJSObject_Call(runtime, func, DJSValue_undefined(), NULL, 0));

  djs_free_runtime(runtime);
}
