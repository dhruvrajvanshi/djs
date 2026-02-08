#include <assert.h>
#include <gc.h>
#include "./djs_object_ops.h"
#include "./djs.h"

typedef struct DJSArray {
  DJSObject obj;
  size_t length;
  size_t capacity;
  DJSValue* elements;
} DJSArray;

static const DJSObjectVTable DJSArrayVTable = {
    .DefineOwnProperty = DJSOrdinaryObjectVTable.DefineOwnProperty,
    .GetOwnProperty = DJSOrdinaryObjectVTable.GetOwnProperty,
    .IsExtensible = DJSOrdinaryObjectVTable.IsExtensible,
    .Call = DJSOrdinaryObjectVTable.Call,
    .SetPrototypeOf = DJSOrdinaryObjectVTable.SetPrototypeOf,
    .GetPrototypeOf = DJSOrdinaryObjectVTable.GetPrototypeOf,
};

DJSArray* djs_array_new_with_capacity(DJSRuntime* runtime, size_t initial_capacity) {
  DJSArray* arr = GC_MALLOC(sizeof(DJSArray));
  DJSObject_init(&arr->obj, &DJSArrayVTable);
  arr->length = 0;
  arr->capacity = initial_capacity;
  arr->elements = NULL;
  return arr;
}

DJSArray* djs_array_new(DJSRuntime* runtime) {
  return djs_array_new_with_capacity(runtime, 4);
}
