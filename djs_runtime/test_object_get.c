#include <assert.h>
#include "./djs.h"
#include "./test_prelude.h"

int main(void) {
  DJSRuntime* runtime = djs_new_runtime();
  // obj = {}
  DJSObject* obj = djs_object_new(runtime);
  DJSPropertyKey key = djs_property_key_from(djs_symbol_new(runtime));
  DJSCompletion completion;

  // Object.hasOwnProperty(obj, key) === false
  completion = djs_object_has_own_property(runtime, obj, key);
  assert(djs_completion_is_normal(completion));
  ASSERT_EQEQEQ(completion.value, djs_false());

  // Object.defineOwnProperty(o, key,  {value: true })
  completion = djs_object_define_own_property(
      runtime, obj, key, djs_property_new_data(runtime, djs_true()));
  assert(djs_completion_is_normal(completion) &&
         "Expected CreateDataProperty to return a normal completion");
  ASSERT_EQEQEQ(completion.value, djs_true());

  // Object.hasOwnProperty(obj, key) === true
  completion = djs_object_has_own_property(runtime, obj, key);
  assert(djs_completion_is_normal(completion));
  ASSERT_EQEQEQ(completion.value, djs_true());

  // Object.getOwnProperty(obj, key).value === true
  completion = djs_object_get_own_property(runtime, obj, key);
  assert(djs_completion_is_normal(completion));
  DJSProperty* existing_property = djs_property_from_value(completion.value);
  assert(existing_property && "Expected the completion to contain a property");
  assert(djs_property_is_data(existing_property) &&
         "Expected the property to be a data property");
  ASSERT_EQEQEQ(djs_property_value(existing_property), djs_true());

  // Object.defineOwnProperty(obj, key, {value: false})
  completion = djs_object_define_own_property(
      runtime, obj, key, djs_property_new_data(runtime, djs_false()));
  assert(djs_completion_is_normal(completion) &&
         "Expected CreateDataProperty to return a normal completion");
  ASSERT_EQEQEQ(completion.value, djs_true());

  completion = djs_object_get_own_property(runtime, obj, key);
  assert(djs_completion_is_normal(completion));
  DJSProperty* updated_property = djs_property_from_value(completion.value);
  assert(updated_property && "Expected the completion to contain a property");
  assert(djs_property_is_data(updated_property) &&
         "Expected the property to be a data property");
  ASSERT_EQEQEQ(djs_property_value(updated_property), djs_false());

  djs_free_runtime(runtime);
}
