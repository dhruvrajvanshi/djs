#include "./print.h"
#include "./runtime.h"
#include "object.h"
#include "value.h"
#include <assert.h>

#define ASSERT_EQEQEQ(left, right)                                             \
  if (!DJS_IsStrictlyEqual(left, right)) {                                     \
    DJSValue left_value = left;                                                \
    DJSValue right_value = right;                                              \
    fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t%s == %s\n",   \
            __FILE__, __LINE__, __FUNCTION__, #left, #right);                  \
    fprintf(stderr, "Because:\n");                                             \
    fprintf(stderr, "\t");                                                     \
    DJSValue_pretty_print(stderr, left_value);                                 \
    fprintf(stderr, " != ");                                                   \
    DJSValue_pretty_print(stderr, right_value);                                \
    fprintf(stderr, "\n");                                                     \
    exit(1);                                                                   \
  }

int main(void) {
  DJSRuntime *runtime = djs_new_runtime();
  DJSObject *obj = DJS_MakeBasicObject(runtime);
  DJSString *key = djs_new_string(runtime, "Key");

  auto get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_UNDEFINED);

  DJSString *value = djs_new_string(runtime, "Value");

  auto set_result =
      djs_object_set(runtime, obj, key, DJSString_to_value(value));
  assert(set_result.abrupt == false);

  get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);

  ASSERT_EQEQEQ(DJSString_to_value(value), get_result.value);

  auto *key2 = djs_new_string(runtime, "Key2");
  auto *value2 = djs_new_string(runtime, "Value2");

  set_result = djs_object_set(runtime, obj, key2, DJSString_to_value(value2));
  assert(set_result.abrupt == false);

  get_result = djs_object_get(runtime, obj, key2);

  ASSERT_EQEQEQ(DJSString_to_value(value2), get_result.value);

  djs_free_runtime(runtime);
}
