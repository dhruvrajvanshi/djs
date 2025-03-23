#include "./completion.h"
#include "./object.h"
#include "./runtime.h"
#include "./value.h"
#include "./test_prelude.h"
#include <assert.h>

int main(void) {
  DJSRuntime* runtime = djs_new_runtime();
  // obj = {}
  DJSObject* obj = DJS_MakeBasicObject(runtime);
  DJSPropertyKey key = DJSPropertyKey_symbol((DJSSymbol){0});
  DJSCompletion completion;

  // Object.hasOwnProperty(obj, key) === false
  completion = DJSObject_HasOwnProperty(runtime, obj, key);
  assert(DJSCompletion_is_normal(completion));
  ASSERT_EQEQEQ(completion.value, DJSValue_bool(false));

  // o[key] = true
  completion =
      DJSObject_CreateDataProperty(runtime, obj, key, DJSValue_bool(true));
  assert(DJSCompletion_is_normal(completion) &&
         "Expected CreateDataProperty to return a normal completion");
  ASSERT_EQEQEQ(completion.value, DJSValue_bool(true));

  // Object.hasOwnProperty(obj, key) === true
  completion = DJSObject_HasOwnProperty(runtime, obj, key);
  assert(DJSCompletion_is_normal(completion));
  ASSERT_EQEQEQ(completion.value, DJSValue_bool(true));

  // Object.getOwnProperty(obj, key).value === true
  completion = DJSObject_GetOwnProperty(runtime, obj, key);
  assert(DJSCompletion_is_normal(completion));
  DJSProperty* existing_property = DJSProperty_from_value(completion.value);
  assert(existing_property && "Expected the completion to contain a property");
  assert(DJSProperty_is_data(existing_property) &&
         "Expected the property to be a data property");
  ASSERT_EQEQEQ(DJSProperty_value(existing_property), DJSValue_bool(true));

  // Object.defineOwnProperty(obj, key, {value: false})
  completion =
      DJSObject_CreateDataProperty(runtime, obj, key, DJSValue_bool(false));
  assert(DJSCompletion_is_normal(completion) &&
         "Expected CreateDataProperty to return a normal completion");
  ASSERT_EQEQEQ(completion.value, DJSValue_bool(true));

  completion = DJSObject_GetOwnProperty(runtime, obj, key);
  assert(DJSCompletion_is_normal(completion));
  DJSProperty* updated_property = DJSProperty_from_value(completion.value);
  assert(updated_property && "Expected the completion to contain a property");
  assert(DJSProperty_is_data(updated_property) &&
         "Expected the property to be a data property");
  ASSERT_EQEQEQ(DJSProperty_value(updated_property), DJSValue_bool(false));

  djs_free_runtime(runtime);
}
