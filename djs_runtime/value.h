#pragma once
#include <memory.h>
#include <stdbool.h>
#include "./prelude.h"

typedef struct DJSObject DJSObject;

typedef enum DJSValueType {
  DJS_TYPE_UNDEFINED,
  DJS_TYPE_NULL,
  DJS_TYPE_BOOLEAN,
  DJS_TYPE_NUMBER,
  DJS_TYPE_OBJECT,
  DJS_TYPE_STRING,
  DJS_TYPE_SYMBOL,
} DJSValueType;

typedef struct DJSString {
  size_t length;
  const char* value;
} DJSString;

static inline bool DJSString_eq(DJSString left, DJSString right) {
  if (left.length != right.length) {
    return false;
  }
  return memcmp((void*)left.value, (void*)right.value, left.length) == 0;
}

typedef struct DJSSymbol {
  size_t id;
} DJSSymbol;
static inline bool DJSSymbol_eq(DJSSymbol left, DJSSymbol right) {
  return left.id == right.id;
}

typedef struct DJSValue {
  DJSValueType type;
  union {
    bool undefined;
    bool null;
    bool boolean;
    double number;
    DJSString* string;
    DJSObject* object;
    DJSSymbol symbol;
  } as;
} DJSValue;

static inline DJSValue DJSString_to_value(DJSString* string) {
  return (DJSValue){.type = DJS_TYPE_STRING, .as = {.string = string}};
}

static inline DJSValue DJSValue_undefined(void) {
  return (DJSValue){.type = DJS_TYPE_UNDEFINED, .as = {.undefined = true}};
}
static inline bool DJSValue_is_undefined(DJSValue value) {
  return value.type == DJS_TYPE_UNDEFINED;
}

static inline DJSValue DJSValue_null(void) {
  return (DJSValue){.type = DJS_TYPE_NULL, .as = {.null = true}};
}
static inline bool DJSValue_is_null(DJSValue value) {
  return value.type == DJS_TYPE_NULL;
}
static inline DJSValue DJSValue_object(DJSObject* object) {
  return (DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = object}};
}
static inline bool DJSValue_is_object(DJSValue value) {
  return value.type == DJS_TYPE_OBJECT;
}
static inline DJSObject* NULLABLE DJSValue_as_object(DJSValue value) {
  if (DJSValue_is_object(value)) {
    return value.as.object;
  } else {
    return NULL;
  }
}
static inline DJSValue DJSValue_string(DJSString* str) {
  return DJSString_to_value(str);
}
static inline DJSValue DJSValue_bool(bool value) {
  return (DJSValue){.type = DJS_TYPE_BOOLEAN, .as = {.boolean = value}};
}
static inline bool DJSValue_is_bool(DJSValue value) {
  return value.type == DJS_TYPE_BOOLEAN;
}
static inline bool DJSValue_is_false(DJSValue value) {
  return DJSValue_is_bool(value) && !value.as.boolean;
}
static inline bool DJSValue_is_true(DJSValue value) {
  return DJSValue_is_bool(value) && value.as.boolean;
}
static inline DJSValue DJSValue_symbol(size_t value) {
  return (DJSValue){.type = DJS_TYPE_SYMBOL,
                    .as = {.symbol = (DJSSymbol){value}}};
}
