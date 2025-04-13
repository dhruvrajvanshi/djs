#pragma once
#include <stddef.h>

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSProperty DJSProperty;
typedef struct DJSString DJSString;

typedef struct DJSSymbol {
  size_t id;
} DJSSymbol;

typedef struct DJSRuntime DJSRuntime;
typedef DJSObject DJSObject;
typedef struct DJSProperty DJSProperty;
enum DJSPropertyKeyType {
  DJS_PROPERTY_KEY_STRING = 0,
  DJS_PROPERTY_KEY_SYMBOL = 1,
};
typedef struct DJSPropertyKey {
  enum DJSPropertyKeyType type;
  union {
    const DJSString* string;
    DJSSymbol symbol;
  } as;
} DJSPropertyKey;

DJSRuntime* djs_new_runtime(void);
void djs_free_runtime(DJSRuntime*);
