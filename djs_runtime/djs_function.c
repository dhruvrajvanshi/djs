#include <assert.h>
#include <gc.h>
#include "./djs_object_ops.h"

typedef struct DJSFunction {
  DJSObject obj;
  DJSCompletion (*call)(DJSRuntime*,
                        DJSValue this,
                        DJSValue* args,
                        size_t argc);
} DJSFunction;

static const DJSObjectVTable DJSFunctionVTable;

static DJSCompletion call_function(DJSRuntime* runtime,
                                   DJSObject* f,
                                   DJSValue this,
                                   DJSValue* args,
                                   size_t argc) {
  assert(f->vtable == &DJSFunctionVTable);
  return ((DJSFunction*)f)->call(runtime, this, args, argc);
}

static const DJSObjectVTable DJSFunctionVTable = {
    .DefineOwnProperty = DJSOrdinaryObjectVTable.DefineOwnProperty,
    .GetOwnProperty = DJSOrdinaryObjectVTable.GetOwnProperty,
    .IsExtensible = DJSOrdinaryObjectVTable.IsExtensible,
    .Call = call_function,
    .SetPrototypeOf = DJSOrdinaryObjectVTable.SetPrototypeOf,
    .GetPrototypeOf = DJSOrdinaryObjectVTable.GetPrototypeOf,
};

DJSFunction* djs_function_new(
    DJSRuntime* UNUSED(runtime),
    DJSCompletion (*call)(DJSRuntime*, DJSValue, DJSValue*, size_t)) {
  DJSFunction* f = GC_MALLOC(sizeof(DJSFunction));
  DJSObject_init(&f->obj, &DJSFunctionVTable);
  f->call = call;
  return f;
}
