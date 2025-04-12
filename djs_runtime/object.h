#pragma once
#include <stdint.h>
#include "./completion.h"
#include "./function.h"
#include "./value.h"

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
    DJSString string;
    DJSSymbol symbol;
  } as;
} DJSPropertyKey;
static inline DJSPropertyKey DJSPropertyKey_symbol(DJSSymbol symbol) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_SYMBOL,
                          .as = {.symbol = symbol}};
}

static inline DJSPropertyKey DJSPropertyKey_string(DJSString string) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_STRING,
                          .as = {.string = string}};
}

DJSObject* DJS_MakeBasicObject(DJSRuntime* runtime);

DJSCompletion DJSObject_Call(DJSRuntime* runtime,
                             DJSObject* f,
                             DJSValue this,
                             DJSValue* args,
                             size_t argc);

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
DJSCompletion DJSObject_SetPrototypeOf(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSObject* proto);

DJSCompletion DJSObject_Get(DJSRuntime* runtime,
                            DJSObject* obj,
                            DJSPropertyKey key);

typedef uint8_t DJSPropertyFlags;

static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;

DJSProperty* DJSProperty_new_data_property(DJSRuntime* runtime,
                                           DJSValue value,
                                           DJSPropertyFlags flags);
DJSProperty* DJSProperty_new_accessor_property(DJSRuntime* UNUSED(runtime),
                                               DJSFunction* NULLABLE getter,
                                               DJSFunction* NULLABLE setter,
                                               DJSPropertyFlags flags);
DJSProperty* DJSProperty_from_value(DJSValue value);
bool DJSProperty_is_data(const DJSProperty* property);
DJSValue DJSProperty_value(DJSProperty* property);
