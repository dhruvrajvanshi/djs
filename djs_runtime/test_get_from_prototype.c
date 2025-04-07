#include "./runtime.h"
#include "./test_prelude.h"
#include "object.h"
#include "value.h"

int main(void) {
  DJSRuntime* vm = djs_new_runtime();

  DJSObject* obj = DJS_MakeBasicObject(vm);
  DJSObject* proto = DJS_MakeBasicObject(vm);

  // Object.setPrototypeOf(obj, proto);
  DJSObject_SetPrototypeOf(vm, obj, proto);

  auto key = DJSPropertyKey_string(*DJS_new_string(vm, "key"));
  auto value = DJS_new_string_as_value(vm, "value");

  // proto[key] = value;
  DJSObject_CreateDataProperty(vm, proto, key, value);

  djs_free_runtime(vm);
}
