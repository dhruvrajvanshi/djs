#include "./runtime.h"
#include "./test_prelude.h"
#include "object.h"
#include "value.h"

int main(void) {
  auto vm = djs_new_runtime();

  auto obj = DJS_MakeBasicObject(vm);
  auto proto = DJS_MakeBasicObject(vm);

  // Object.setPrototypeOf(obj, proto);
  ASSERT_NORMAL(DJSObject_SetPrototypeOf(vm, obj, proto), djs_value(true));

  auto key = djs_property_key(*DJS_new_string(vm, "key"));
  auto value = djs_value(DJS_new_string(vm, "value"));

  // proto[key] = value;
  ASSERT_NORMAL(DJSObject_CreateDataProperty(vm, proto, key, value),
                djs_value(true));

  djs_free_runtime(vm);
}
