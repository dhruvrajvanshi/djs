#pragma once
#include "./prelude.h"
#include <memory.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

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
  const char *value;
} DJSString;

static inline bool DJSString_eq(DJSString left, DJSString right) {
  if (left.length != right.length) {
    return false;
  }
  return memcmp((void *)left.value, (void *)right.value, left.length) == 0;
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
    DJSString *string;
    DJSObject *object;
    DJSSymbol symbol;
  } as;
} DJSValue;

static inline DJSValue DJSString_to_value(DJSString *string) {
  return (DJSValue){.type = DJS_TYPE_STRING, .as = {.string = string}};
}
