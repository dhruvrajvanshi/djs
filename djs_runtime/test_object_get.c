#include "./print.h"
#include "./runtime.h"
#include <assert.h>

#define ASSERT_EQEQEQ(left, right)                                             \
  if (!djs_eqeqeq(left, right)) {                                              \
    DJSValue left_value = left;                                                \
    DJSValue right_value = right;                                              \
    fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t%s == %s\n",   \
            __FILE__, __LINE__, __FUNCTION__, #left, #right);                  \
    fprintf(stderr, "Because:\n");                                             \
    fprintf(stderr, "\t");                                                     \
    DJSValue_pretty_print(stderr, &left_value);                                \
    fprintf(stderr, " != ");                                                   \
    DJSValue_pretty_print(stderr, &right_value);                               \
    fprintf(stderr, "\n");                                                     \
    exit(1);                                                                   \
  }

int main(void) {
  auto *runtime = djs_new_runtime();
  auto *obj = (DJSObject *)djs_new_instance(runtime);
  auto *key = djs_new_string(runtime, "Key");

  auto get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_UNDEFINED);

  auto *value = djs_new_string(runtime, "Value");

  auto set_result =
      djs_object_set(runtime, obj, key, DJS_OBJECT_AS_VALUE(value));
  assert(set_result.abrupt == false);

  get_result = djs_object_get(runtime, obj, key);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_OBJECT);
  auto *get_result_value = get_result.value.as.object;

  assert(get_result_value->type == DJS_OBJECT_STRING);
  ASSERT_EQEQEQ(DJS_OBJECT_AS_VALUE(value), get_result.value);

  auto *key2 = djs_new_string(runtime, "Key2");
  auto *value2 = djs_new_string(runtime, "Value2");

  set_result = djs_object_set(runtime, obj, key2, DJS_OBJECT_AS_VALUE(value2));
  assert(set_result.abrupt == false);

  get_result = djs_object_get(runtime, obj, key2);
  assert(get_result.abrupt == false);
  assert(get_result.value.type == DJS_TYPE_OBJECT);

  ASSERT_EQEQEQ(DJS_OBJECT_AS_VALUE(value2), get_result.value);

  djs_free_runtime(runtime);
}
