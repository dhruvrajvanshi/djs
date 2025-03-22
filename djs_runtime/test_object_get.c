#include <assert.h>
#include <gc.h>
#include "./completion.h"
#include "./object.h"
#include "./property.h"
#include "./runtime.h"

#define ASSERT_EQEQEQ(left, right)                                           \
  if (!DJS_IsStrictlyEqual(left, right)) {                                   \
    DJSValue left_value = left;                                              \
    DJSValue right_value = right;                                            \
    fprintf(stderr, "Assertion failed:%s:%d: in function %s:\n\t%s == %s\n", \
            __FILE__, __LINE__, __FUNCTION__, #left, #right);                \
    fprintf(stderr, "Because:\n");                                           \
    fprintf(stderr, "\t");                                                   \
    DJSValue_pretty_print(stderr, left_value);                               \
    fprintf(stderr, " != ");                                                 \
    DJSValue_pretty_print(stderr, right_value);                              \
    fprintf(stderr, "\n");                                                   \
    exit(1);                                                                 \
  }

int main(void) {
  DJSRuntime* runtime = djs_new_runtime();
  DJSObject* obj = DJS_MakeBasicObject(runtime);
  DJSPropertyKey key = DJSPropertyKey_symbol((DJSSymbol){0});
  DJSProperty* descriptor = DJSProperty_new_data_property(
      runtime, DJSValue_bool(true), DJS_PROPERTY_WRITABLE);

  DJSObject_DefineOwnProperty(runtime, obj, key, descriptor);
  DJSCompletion completion = DJSObject_HasOwnProperty(runtime, obj, key);
  assert(DJSCompletion_is_normal(completion));
  assert(DJSValue_is_bool(completion.value));
  assert(completion.value.as.boolean);

  djs_free_runtime(runtime);
}
