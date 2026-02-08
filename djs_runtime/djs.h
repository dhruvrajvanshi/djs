#pragma once
#include <stddef.h>
#include "./djs_prelude.h"

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSArray DJSArray;
typedef struct DJSString DJSString;
typedef struct DJSFunction DJSFunction;
typedef struct DJSProperty DJSProperty;

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
static inline DJSValue djs_undefined(void) {
  return (DJSValue){.type = DJS_TYPE_UNDEFINED, .as = {.undefined = true}};
}
static inline DJSValue djs_null(void) {
  return (DJSValue){.type = DJS_TYPE_NULL, .as = {.null = true}};
}
static inline DJSValue djs_bool(bool value) {
  return (DJSValue){.type = DJS_TYPE_BOOLEAN, .as = {.boolean = value}};
}
static inline DJSValue djs_true(void) {
  return djs_bool(true);
}
static inline DJSValue djs_false(void) {
  return djs_bool(false);
}
static inline DJSValue djs_number(double value) {
  return (DJSValue){.type = DJS_TYPE_NUMBER, .as = {.number = value}};
}
static inline DJSValue djs_object(DJSObject* object) {
  return (DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = object}};
}
static inline DJSValue djs_string(const DJSString* string) {
  return (DJSValue){.type = DJS_TYPE_STRING, .as = {.string = string}};
}
static inline DJSValue djs_symbol(DJSSymbol symbol) {
  return (DJSValue){.type = DJS_TYPE_SYMBOL, .as = {.symbol = symbol}};
}
static inline bool djs_is_undefined(DJSValue value) {
  return value.type == DJS_TYPE_UNDEFINED;
}
static inline bool djs_is_null(DJSValue value) {
  return value.type == DJS_TYPE_NULL;
}
static inline bool djs_is_bool(DJSValue value) {
  return value.type == DJS_TYPE_BOOLEAN;
}
static inline bool djs_is_true(DJSValue value) {
  return value.type == DJS_TYPE_BOOLEAN && value.as.boolean;
}
static inline bool djs_is_false(DJSValue value) {
  return value.type == DJS_TYPE_BOOLEAN && !value.as.boolean;
}
static inline bool djs_value_as_bool(DJSValue value) {
  return value.as.boolean;
}
static inline bool djs_is_number(DJSValue value) {
  return value.type == DJS_TYPE_NUMBER;
}
static inline bool djs_is_object(DJSValue value) {
  return value.type == DJS_TYPE_OBJECT;
}
static inline bool djs_is_string(DJSValue value) {
  return value.type == DJS_TYPE_STRING;
}
static inline bool djs_is_symbol(DJSValue value) {
  return value.type == DJS_TYPE_SYMBOL;
}

static inline DJSObject* NULLABLE djs_value_as_object(DJSValue value) {
  if (value.type != DJS_TYPE_OBJECT) {
    return NULL;
  }
  return value.as.object;
}

#define djs_value_from(X)           \
  _Generic((X),                     \
      DJSObject *: djs_object,      \
      const DJSString*: djs_string, \
      DJSProperty*: djs_property_as_value)(X)

typedef struct DJSCompletion {
  DJSValue value;
  bool abrupt;
} DJSCompletion;
static inline DJSCompletion djs_completion_normal(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = false};
}
static inline DJSCompletion djs_completion_abrupt(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = true};
}
static inline bool djs_completion_is_abrupt(DJSCompletion completion) {
  return completion.abrupt;
}
static inline bool djs_completion_is_normal(DJSCompletion completion) {
  return !completion.abrupt;
}

typedef struct DJSRuntime DJSRuntime;
typedef DJSObject DJSObject;
typedef struct DJSProperty DJSProperty;
DJSValue djs_property_as_value(DJSProperty* property);
DJSProperty* NULLABLE djs_property_from_value(DJSValue value);
bool djs_property_is_data(const DJSProperty* property);
bool djs_property_is_accessor(const DJSProperty* property);
DJSValue djs_property_value(DJSProperty* property);
DJSFunction* NULLABLE djs_property_get(DJSProperty* property);
DJSFunction* NULLABLE djs_property_set(DJSProperty* property);

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
DJSObject* djs_object_new(DJSRuntime* runtime);
DJSArray* djs_array_new(DJSRuntime* runtime);
DJSSymbol djs_symbol_new(DJSRuntime* runtime);
DJSPropertyKey djs_property_key_from_symbol(DJSSymbol symbol);
DJSPropertyKey djs_property_key_from_string(const DJSString* string);

#define djs_property_key_from(X)                      \
  _Generic((X),                                       \
      const DJSString*: djs_property_key_from_string, \
      DJSSymbol: djs_property_key_from_symbol)(X)

DJSProperty* NULLABLE djs_property_from_value(DJSValue value);
DJSCompletion djs_object_has_own_property(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key);

DJSCompletion djs_call(DJSRuntime* runtime,
                       DJSObject* f,
                       DJSValue this,
                       DJSValue* args,
                       size_t argc);

DJSProperty* djs_property_new_data(DJSRuntime* runtime, DJSValue value);
DJSProperty* djs_property_new_accessor(DJSRuntime* runtime,
                                       DJSFunction* getter,
                                       DJSFunction* setter);
DJSCompletion djs_object_is_extensible(DJSRuntime* runtime, DJSObject* obj);
DJSCompletion djs_object_define_own_property(DJSRuntime* runtime,
                                             DJSObject* obj,
                                             DJSPropertyKey key,
                                             DJSProperty* descriptor);
DJSCompletion djs_object_get_own_property(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key);
DJSCompletion djs_object_has_own_property(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key);
DJSCompletion djs_object_set_prototype_of(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSObject* NULLABLE proto);

DJSCompletion djs_object_get(DJSRuntime* runtime,
                             DJSObject* obj,
                             DJSPropertyKey key);

DJSFunction* djs_function_new(
    DJSRuntime* runtime,
    DJSCompletion (*call)(DJSRuntime*, DJSValue, DJSValue*, size_t));

const DJSString* djs_string_new(DJSRuntime* runtime, const char* cstr);

void djs_value_pretty_print(FILE* file, DJSValue value);
bool djs_is_strictly_equal(DJSValue left, DJSValue right);
