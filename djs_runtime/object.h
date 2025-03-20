#pragma once
#include "./completion.h"
#include "./value.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSProperty DJSProperty;

typedef struct DJSPropertyKey {
  enum {
    DJS_PROPERTY_KEY_STRING = 0,
    DJS_PROPERTY_KEY_SYMBOL = 1,
  } type;
  union {
    DJSString string;
    DJSSymbol symbol;
  } as;
} DJSPropertyKey;

DJSObject *DJS_MakeBasicObject(DJSRuntime *runtime);

DJSCompletion DJSObject_IsExtensible(DJSRuntime *runtime, DJSObject *obj);
DJSCompletion DJSObject_DefineOwnProperty(DJSRuntime *runtime, DJSObject *obj,
                                          DJSValue key, DJSValue descriptor);
DJSCompletion DJSObject_GetOwnProperty(DJSRuntime *runtime, DJSObject *obj,
                                       DJSValue key);
