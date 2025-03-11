#include "./runtime.h"
#include <assert.h>

int main(void) {
  DJSRuntime *runtime = djs_new_runtime();
  DJSObject *obj = (DJSObject *)djs_new_instance(runtime);
  DJSString *key = djs_new_string(runtime, "Key");

  DJSCompletion get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_UNDEFINED);

  DJSString *value = djs_new_string(runtime, "Value");

  DJSCompletion set_result =
      djs_object_set(runtime, obj, key, DJS_OBJECT_AS_VALUE(value));
  assert(set_result.abrupt == false);

  get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_OBJECT);
  DJSObject *get_result_value = get_result.value.as.object;

  assert(get_result_value->type == DJS_OBJECT_STRING);
  assert(djs_eqeqeq(DJS_OBJECT_AS_VALUE(value), get_result.value));

  djs_free_runtime(runtime);
}
