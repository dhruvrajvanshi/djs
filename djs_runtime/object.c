#include "./object.h"
#include "./prelude.h"
#include "gc.h"

void DJSObject_init(DJSObject *self) { self->properties = NULL; }

DJSObject *DJS_MakeBasicObject(DJSRuntime *UNUSED(runtime)) {
  DJSObject *obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj);
  return obj;
}
