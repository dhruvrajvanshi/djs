#include "./runtime.h"
#include "./test_prelude.h"
#include "object.h"
#include "value.h"

int main(void) {
  DJSRuntime* vm = djs_new_runtime();

  DJSObject* obj = DJS_MakeBasicObject(vm);
  DJSObject* proto = DJS_MakeBasicObject(vm);
  DJSObject_SetPrototypeOf(vm, obj, proto);

  djs_free_runtime(vm);
}
