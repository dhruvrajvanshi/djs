#pragma once
#include "./value.h"
#include <stddef.h>

typedef struct DJSObjectEntry DJSObjectEntry;

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

typedef struct DJSObject {
  DJSObjectEntry *properties;
} DJSObject;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSValue value;
  DJSObjectEntry *next;
} DJSObjectEntry;

static inline bool DJSPropertyKey_eq(DJSPropertyKey left,
                                     DJSPropertyKey right) {
  if (left.type != right.type) {
    return false;
  }
  switch (left.type) {
  case DJS_PROPERTY_KEY_STRING:
    return DJSString_eq(left.as.string, right.as.string);
  case DJS_PROPERTY_KEY_SYMBOL:
    return DJSSymbol_eq(left.as.symbol, right.as.symbol);
  }
}

static inline DJSPropertyKey DJSPropertyKey_string(DJSString string) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_STRING,
                          .as = {.string = string}};
}

static inline DJSPropertyKey DJSPropertyKey_symbol(DJSSymbol symbol) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_SYMBOL,
                          .as = {.symbol = symbol}};
}

static inline DJSValue DJSObject_as_value(DJSObject *object) {
  return (DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = object}};
}
