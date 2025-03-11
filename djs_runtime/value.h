#pragma once
#include <stdbool.h>

typedef struct DJSObject DJSObject;

typedef enum DJSValueType {
  DJS_TYPE_UNDEFINED,
  DJS_TYPE_NULL,
  DJS_TYPE_BOOLEAN,
  DJS_TYPE_NUMBER,
  DJS_TYPE_OBJECT,
} DJSValueType;

typedef struct DJSValue {
  DJSValueType type;
  union {
    bool undefined;
    bool null;
    bool boolean;
    double number;
    DJSObject *object;
  } as;
} DJSValue;
