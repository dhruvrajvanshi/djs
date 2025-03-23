#pragma once
#include <stdint.h>
#include "./completion.h"
#include "./value.h"

typedef struct DJSRuntime DJSRuntime;
typedef DJSObject DJSObject;
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
static inline DJSPropertyKey DJSPropertyKey_symbol(DJSSymbol symbol) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_SYMBOL,
                          .as = {.symbol = symbol}};
}

DJSObject* DJS_MakeBasicObject(DJSRuntime* runtime);

DJSCompletion DJSObject_IsExtensible(DJSRuntime* runtime, DJSObject* obj);
DJSCompletion DJSObject_DefineOwnProperty(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key,
                                          DJSProperty* descriptor);
DJSCompletion DJSObject_GetOwnProperty(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSPropertyKey key);
DJSCompletion DJSObject_HasOwnProperty(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSPropertyKey key);
DJSCompletion DJSObject_CreateDataProperty(DJSRuntime*,
                                           DJSObject* obj,
                                           DJSPropertyKey key,
                                           DJSValue value);

typedef uint8_t DJSPropertyFlags;

static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;

DJSProperty* DJSProperty_new_data_property(DJSRuntime* runtime,
                                           DJSValue value,
                                           DJSPropertyFlags flags);
DJSProperty* DJSProperty_from_value(DJSValue value);
bool DJSProperty_is_data(const DJSProperty* property);
DJSValue DJSProperty_value(DJSProperty* property);
