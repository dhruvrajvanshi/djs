#pragma once
#include "./value.h"
#include <stddef.h>

typedef enum DJSObjectType {
  DJS_OBJECT_STRING,
  DJS_OBJECT_INSTANCE,
} DJSObjectType;

typedef struct DJSObjectEntry DJSObjectEntry;
typedef struct DJSObject {
  DJSObjectType type;
  DJSObjectEntry *properties;
} DJSObject;

typedef struct DJSObjectEntry {
  DJSObject *key;
  DJSValue value;
  DJSObjectEntry *next;
} DJSObjectEntry;

typedef struct DJSInstance {
  DJSObject obj;
} DJSInstance;

typedef struct DJSString {
  DJSObject obj;
  size_t length;
  const char *value;
} DJSString;
