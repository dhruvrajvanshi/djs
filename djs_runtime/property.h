#pragma once
#include "./prelude.h"
#include "./value.h"
#include <assert.h>

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

typedef struct DJSDataProperty {
  DJSValue value;
} DJSDataProperty;

typedef struct DJSAccessorProperty {
  DJSObject *get;
  DJSObject *set;
} DJSAccessorProperty;

typedef uint8_t DJSPropertyFlags;
typedef struct DJSProperty {
  DJSPropertyFlags flags;
  union {
    DJSDataProperty data;
    DJSAccessorProperty accessor;
  } as;
} DJSProperty;

MK_OPT(OptDJSProperty, DJSProperty);

static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;

static inline bool DJSProperty_is_writable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_WRITABLE;
}
static inline bool DJSPRoperty_is_enumerable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_ENUMERABLE;
}
static inline bool DJSProperty_is_configurable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_CONFIGURABLE;
}
static inline bool DJSProperty_is_accessor(DJSProperty property) {
  return property.flags & DJS_PROPERTY_TYPE_MASK;
}
static inline bool DJSProperty_is_data(DJSProperty property) {
  return !DJSProperty_is_accessor(property);
}

static inline DJSValue DJSProperty_value(DJSProperty property) {
  assert(DJSProperty_is_data(property));
  return property.as.data.value;
}

static DJSProperty __attribute__((unused))
DJSProperty_data(DJSValue value, DJSPropertyFlags flags) {
  assert(!(flags & DJS_PROPERTY_TYPE_MASK) &&
         "Property type should not be set");
  return (DJSProperty){.flags = flags, .as = {.data = {.value = value}}};
}

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
