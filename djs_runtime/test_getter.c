#include "./test_prelude.h"
#include "djs.h"

static DJSCompletion getter_callback(DJSRuntime* rt,
                                     DJSValue UNUSED(this),
                                     DJSValue* UNUSED(args),
                                     size_t UNUSED(argc)) {
  DJSValue value = djs_value_from(djs_string_new(rt, "Hello from the getter!"));
  return djs_completion_normal(value);
}

int main(void) {
  auto rt = djs_new_runtime();
  auto obj = djs_object_new(rt);
  auto key = djs_property_key_from(djs_symbol_new(rt));
  auto getter = djs_function_new(rt, getter_callback);
  DJSProperty* desc = djs_property_new_accessor(rt, getter, nullptr);

  ASSERT_NORMAL(djs_object_define_own_property(rt, obj, key, desc), djs_true());

  ASSERT_NORMAL(djs_object_get(rt, obj, key),
                djs_value_from(djs_string_new(rt, "Hello from the getter!")));
  djs_free_runtime(rt);
}
