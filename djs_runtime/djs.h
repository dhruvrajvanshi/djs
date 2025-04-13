#pragma once
#include <stddef.h>

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSProperty DJSProperty;
typedef struct DJSString DJSString;

typedef struct DJSSymbol {
  size_t id;
} DJSSymbol;

typedef enum DJSValueType {
  DJS_TYPE_UNDEFINED,
  DJS_TYPE_NULL,
  DJS_TYPE_BOOLEAN,
  DJS_TYPE_NUMBER,
  DJS_TYPE_OBJECT,
  DJS_TYPE_STRING,
  DJS_TYPE_SYMBOL,
} DJSValueType;

typedef struct DJSValue {
  DJSValueType type;
  union {
    bool undefined;
    bool null;
    bool boolean;
    double number;
    const DJSString* string;
    DJSObject* object;
    DJSSymbol symbol;
  } as;
} DJSValue;

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
