#include "./function.h"
#include <assert.h>
#include <gc.h>
#include "./completion.h"
#include "./object_layout.h"

typedef struct DJSFunction {
  DJSObject obj;
  DJSCompletion (*call)(DJSRuntime*,
                        DJSValue this,
                        DJSValue* args,
                        size_t argc);
} DJSFunction;

static const DJSObjectVTable DJSFunctionVTable;
static DJSCompletion DJSFunctionCall(DJSRuntime* runtime,
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
    .Call = DJSFunctionCall,
};

static DJSObject* DJSFunction_as_object(DJSFunction* function) {
  // Safe because DJSFunction is the first field of DJSObject.
  return (DJSObject*)function;
}

DJSFunction* DJSFunction_new(
    DJSRuntime* runtime,
    DJSCompletion (*call)(DJSRuntime*, DJSValue, DJSValue*, size_t)) {
  DJSFunction* f = GC_MALLOC(sizeof(DJSFunction));
  DJSObject_init(DJSFunction_as_object(f), &DJSFunctionVTable);
  f->call = call;
  return f;
}
