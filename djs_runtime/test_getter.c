#include "./object_layout.h"
#include "./runtime.h"
#include "./test_prelude.h"
#include "function.h"
#include "object.h"

static DJSCompletion getter_callback(DJSRuntime* rt,
                                     DJSValue UNUSED(this),
                                     DJSValue* UNUSED(args),
                                     size_t UNUSED(argc)) {
  DJSValue value = djs_value(DJS_new_string(rt, "Hello from the getter!"));
  return DJSCompletion_normal(value);
}

int main(void) {
  auto rt = djs_new_runtime();
  auto obj = DJS_MakeBasicObject(rt);
  auto key = DJSPropertyKey_symbol((DJSSymbol){0});
  auto getter = DJSFunction_new(rt, getter_callback);
  DJSProperty* desc = DJSProperty_new_accessor_property(rt, getter, nullptr, 0);

  ASSERT_NORMAL(DJSObject_DefineOwnProperty(rt, obj, key, desc),
                djs_value(true));

  ASSERT_NORMAL(DJSObject_Get(rt, obj, key),
                DJS_new_string_as_value(rt, "Hello from the getter!"));
  djs_free_runtime(rt);
}
